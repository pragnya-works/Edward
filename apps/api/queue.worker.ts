import "dotenv/config";
import { Worker } from "bullmq";
import {
  JobPayloadSchema,
  JobPayload,
  JobType,
  BuildJobPayload,
  BackupJobPayload,
} from "./services/queue/queue.schemas.js";
import { createLogger } from "./utils/logger.js";
import {
  AGENT_RUN_WORKER_CONCURRENCY,
  BUILD_WORKER_CONCURRENCY,
  CLEANUP_INTERVAL_MS,
  VERSION,
} from "./utils/constants.js";
import {
  AGENT_RUN_QUEUE_NAME,
  BUILD_QUEUE_NAME,
  connection,
} from "./lib/queue.binding.js";
import { buildAndUploadUnified } from "./services/sandbox/builder/unified.build.js";
import { backupSandboxInstance } from "./services/sandbox/backup.service.js";
import { getSandboxState } from "./services/sandbox/state.service.js";
import { createBuild, updateBuild } from "@edward/auth";
import { BuildRecordStatus } from "@edward/shared/api/contracts";
import { enqueueBackupJob } from "./services/queue/enqueue.js";
import { createRedisClient } from "./lib/redis.js";
import { createErrorReport } from "./services/diagnostics/errorReport.js";
import { processAgentRunJob } from "./services/runs/agentRun.worker.js";
import { processScheduledFlushes } from "./services/sandbox/write/flush.scheduler.js";
import { reapStaleRuns } from "./services/runs/staleRunReaper.service.js";

const logger = createLogger("WORKER");
const pubClient = createRedisClient();
const processHandlerState = globalThis as typeof globalThis & {
  __edwardProcessHandlers?: Map<string, (...args: unknown[]) => void>;
};

function registerProcessHandlerOnce(
  key: string,
  event: "SIGINT" | "SIGTERM",
  handler: (...args: unknown[]) => void,
): void {
  const registry = processHandlerState.__edwardProcessHandlers ?? new Map();
  processHandlerState.__edwardProcessHandlers = registry;

  const existing = registry.get(key);
  if (existing) {
    process.off(event, existing as never);
  }

  process.on(event, handler as never);
  registry.set(key, handler);
}

async function createErrorReportIfPossible(
  sandboxId: string,
  error: string | undefined,
): Promise<{ errorReport: unknown }> {
  if (!error) {
    return { errorReport: null };
  }

  const sandbox = await getSandboxState(sandboxId);
  const containerId = sandbox?.containerId;

  if (!containerId) {
    return { errorReport: null };
  }

  try {
    const report = await createErrorReport(
      containerId,
      error,
      sandbox?.scaffoldedFramework,
    );

    logger.info(
      {
        sandboxId,
        errorCount: report.summary.totalErrors,
        processed: report.errors.length,
        types: report.summary.uniqueTypes,
      },
      "[Worker] Error report created",
    );

    return { errorReport: report as unknown };
  } catch (err) {
    logger.warn(
      { error: err, sandboxId },
      "[Worker] Error report creation failed",
    );
    return { errorReport: null };
  }
}

async function processBuildJob(payload: BuildJobPayload): Promise<void> {
  const { sandboxId, chatId, messageId, userId, buildId, runId } = payload;
  const correlationRunId = runId ?? messageId;
  const startTime = Date.now();

  const buildRecord = buildId
    ? { id: buildId }
    : await createBuild({
        chatId,
        messageId,
        status: BuildRecordStatus.QUEUED,
      });

  await updateBuild(buildRecord.id, {
    status: BuildRecordStatus.BUILDING,
  });

  await pubClient.publish(
    `edward:build-status:${chatId}`,
    JSON.stringify({
      buildId: buildRecord.id,
      runId: correlationRunId,
      status: BuildRecordStatus.BUILDING,
    }),
  );

  logger.info(
    {
      sandboxId,
      chatId,
      messageId,
      buildId: buildRecord.id,
      runId: correlationRunId,
    },
    "[Worker] Build job started",
  );

  let handled = false;

  try {
    const result = await buildAndUploadUnified(sandboxId);
    const duration = Date.now() - startTime;

    if (result.success) {
      await updateBuild(buildRecord.id, {
        status: BuildRecordStatus.SUCCESS,
        previewUrl: result.previewUrl,
        buildDuration: duration,
      });

      await pubClient.publish(
        `edward:build-status:${chatId}`,
        JSON.stringify({
          buildId: buildRecord.id,
          runId: correlationRunId,
          status: BuildRecordStatus.SUCCESS,
          previewUrl: result.previewUrl,
        }),
      );

      logger.info(
        {
          sandboxId,
          chatId,
          runId: correlationRunId,
          buildDirectory: result.buildDirectory,
          previewUploaded: result.previewUploaded,
          previewUrl: result.previewUrl,
        },
        "[Worker] Build job completed with preview",
      );
      handled = true;
    } else {
      logger.warn(
        { sandboxId, error: result.error },
        "[Worker] Build failed",
      );

      const { errorReport } = await createErrorReportIfPossible(
        sandboxId,
        result.error,
      );

      await updateBuild(buildRecord.id, {
        status: BuildRecordStatus.FAILED,
        errorReport: errorReport as Record<string, unknown> | null,
        buildDuration: duration,
      } as Parameters<typeof updateBuild>[1]);

      await pubClient.publish(
        `edward:build-status:${chatId}`,
        JSON.stringify({
          buildId: buildRecord.id,
          runId: correlationRunId,
          status: BuildRecordStatus.FAILED,
          errorReport,
        }),
      );

      logger.warn(
        {
          sandboxId,
          chatId,
          runId: correlationRunId,
          buildDirectory: result.buildDirectory,
          previewUploaded: result.previewUploaded,
          error: result.error,
        },
        "[Worker] Build job completed without preview",
      );

      handled = true;

      throw new Error(result.error ?? "Build failed without error message");
    }

    try {
      await enqueueBackupJob({ sandboxId, userId });
      logger.debug(
        { sandboxId },
        "[Worker] Backup job enqueued after successful build",
      );
    } catch (backupErr) {
      logger.warn(
        { error: backupErr, sandboxId },
        "[Worker] Failed to enqueue post-build backup (non-fatal)",
      );
    }
  } catch (error) {
    if (!handled) {
      const err = error instanceof Error ? error.message : String(error);
      const { errorReport } = await createErrorReportIfPossible(sandboxId, err);

      await updateBuild(buildRecord.id, {
        status: BuildRecordStatus.FAILED,
        errorReport: errorReport as Record<string, unknown> | null,
      } as Parameters<typeof updateBuild>[1]).catch(() => {});

      await pubClient
        .publish(
          `edward:build-status:${chatId}`,
          JSON.stringify({
            buildId: buildRecord.id,
            runId: correlationRunId,
            status: BuildRecordStatus.FAILED,
            errorReport,
          }),
        )
        .catch(() => {});
    }

    logger.error(
      { error, sandboxId, chatId, runId: correlationRunId },
      "[Worker] Build job failed",
    );
    throw error;
  }
}

async function processBackupJob(payload: BackupJobPayload): Promise<void> {
  const { sandboxId } = payload;

  try {
    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) {
      logger.warn({ sandboxId }, "[Worker] Sandbox not found for backup");
      return;
    }

    await backupSandboxInstance(sandbox);
  } catch (error) {
    logger.error({ error, sandboxId }, "[Worker] Backup job failed");
    throw error;
  }
}

async function processAgentRun(payload: { runId: string }): Promise<void> {
  await processAgentRunJob(payload.runId, pubClient);
}

const buildWorker = new Worker<JobPayload>(
  BUILD_QUEUE_NAME,
  async (job) => {
    const payload = JobPayloadSchema.parse(job.data);

    switch (payload.type) {
      case JobType.BUILD:
        return processBuildJob(payload);
      case JobType.BACKUP:
        return processBackupJob(payload);
      default:
        logger.error(
          { type: (payload as JobPayload).type },
          "[Worker] Unsupported payload type on build queue",
        );
        throw new Error(`Unsupported build queue job type: ${(payload as JobPayload).type}`);
    }
  },
  {
    connection,
    concurrency: BUILD_WORKER_CONCURRENCY,
  },
);

const agentRunWorker = new Worker<JobPayload>(
  AGENT_RUN_QUEUE_NAME,
  async (job) => {
    const payload = JobPayloadSchema.parse(job.data);

    if (payload.type !== JobType.AGENT_RUN) {
      logger.error(
        { type: (payload as JobPayload).type },
        "[Worker] Unsupported payload type on agent-run queue",
      );
      throw new Error(`Unsupported agent-run queue job type: ${(payload as JobPayload).type}`);
    }

    return processAgentRun(payload);
  },
  {
    connection,
    concurrency: AGENT_RUN_WORKER_CONCURRENCY,
  },
);

const scheduledFlushInterval = setInterval(() => {
  void processScheduledFlushes().catch((error: unknown) =>
    logger.error({ error }, "[Worker] Scheduled sandbox flush processing failed"),
  );
}, 250);
scheduledFlushInterval.unref();

const staleRunReaperInterval = setInterval(() => {
  void reapStaleRuns().catch((error: unknown) =>
    logger.error({ error }, "[Worker] Stale run reaper failed"),
  );
}, CLEANUP_INTERVAL_MS);
staleRunReaperInterval.unref();

buildWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id, jobName: job.name }, "[Worker] Job completed");
});

buildWorker.on("failed", (job, error) => {
  logger.error(
    { error, jobId: job?.id, jobName: job?.name },
    "[Worker] Job failed",
  );
});

buildWorker.on("error", (error) => {
  logger.error({ error }, "[Worker] Build worker error");
});

agentRunWorker.on("completed", (job) => {
  logger.debug(
    { jobId: job.id, jobName: job.name },
    "[Worker] Agent run job completed",
  );
});

agentRunWorker.on("failed", (job, error) => {
  logger.error(
    { error, jobId: job?.id, jobName: job?.name },
    "[Worker] Agent run job failed",
  );
});

agentRunWorker.on("error", (error) => {
  logger.error({ error }, "[Worker] Worker error");
});

async function gracefulShutdown() {
  clearInterval(scheduledFlushInterval);
  clearInterval(staleRunReaperInterval);
  await Promise.all([buildWorker.close(), agentRunWorker.close()]);
  await pubClient.quit();
  process.exit(0);
}

registerProcessHandlerOnce("worker:SIGINT", "SIGINT", () => {
  void gracefulShutdown();
});
registerProcessHandlerOnce("worker:SIGTERM", "SIGTERM", () => {
  void gracefulShutdown();
});

logger.info(
  {
    version: VERSION,
    buildWorkerConcurrency: BUILD_WORKER_CONCURRENCY,
    agentRunWorkerConcurrency: AGENT_RUN_WORKER_CONCURRENCY,
  },
  "[Worker] Started listening for jobs",
);

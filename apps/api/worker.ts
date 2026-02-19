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
import { VERSION } from "./utils/constants.js";
import { connection, QUEUE_NAME } from "./lib/queue.js";
import { buildAndUploadUnified } from "./services/sandbox/builder/unified.build.js";
import { backupSandboxInstance } from "./services/sandbox/backup.sandbox.js";
import { getSandboxState } from "./services/sandbox/state.sandbox.js";
import { createBuild, updateBuild } from "@edward/auth";
import { enqueueBackupJob } from "./services/queue/enqueue.js";
import { createRedisClient } from "./lib/redis.js";
import { createErrorReport } from "./services/diagnostics/errorReport.js";
import { processAgentRunJob } from "./services/runs/agentRun.worker.js";
import { WORKER_CONCURRENCY } from "./utils/sharedConstants.js";

const logger = createLogger("WORKER");
const pubClient = createRedisClient();

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
        status: "queued",
      });

  await updateBuild(buildRecord.id, {
    status: "building",
  });

  await pubClient.publish(
    `edward:build-status:${chatId}`,
    JSON.stringify({
      buildId: buildRecord.id,
      runId: correlationRunId,
      status: "building",
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
        status: "success",
        previewUrl: result.previewUrl,
        buildDuration: duration,
      });

      await pubClient.publish(
        `edward:build-status:${chatId}`,
        JSON.stringify({
          buildId: buildRecord.id,
          runId: correlationRunId,
          status: "success",
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
        status: "failed",
        errorReport: errorReport as Record<string, unknown> | null,
        buildDuration: duration,
      } as Parameters<typeof updateBuild>[1]);

      await pubClient.publish(
        `edward:build-status:${chatId}`,
        JSON.stringify({
          buildId: buildRecord.id,
          runId: correlationRunId,
          status: "failed",
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
        status: "failed",
        errorReport: errorReport as Record<string, unknown> | null,
      } as Parameters<typeof updateBuild>[1]).catch(() => {});

      await pubClient
        .publish(
          `edward:build-status:${chatId}`,
          JSON.stringify({
            buildId: buildRecord.id,
            runId: correlationRunId,
            status: "failed",
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

const worker = new Worker<JobPayload>(
  QUEUE_NAME,
  async (job) => {
    const payload = JobPayloadSchema.parse(job.data);

    switch (payload.type) {
      case JobType.BUILD:
        return processBuildJob(payload);
      case JobType.BACKUP:
        return processBackupJob(payload);
      case JobType.AGENT_RUN:
        return processAgentRun(payload);
      default:
        logger.error(
          { type: (payload as JobPayload).type },
          "[Worker] Unknown job type",
        );
        throw new Error(`Unknown job type: ${(payload as JobPayload).type}`);
    }
  },
  {
    connection,
    concurrency: WORKER_CONCURRENCY,
  },
);

worker.on("completed", (job) => {
  logger.debug({ jobId: job.id, jobName: job.name }, "[Worker] Job completed");
});

worker.on("failed", (job, error) => {
  logger.error(
    { error, jobId: job?.id, jobName: job?.name },
    "[Worker] Job failed",
  );
});

worker.on("error", (error) => {
  logger.error({ error }, "[Worker] Worker error");
});

async function gracefulShutdown() {
  await worker.close();
  await pubClient.quit();
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

logger.info(`[Worker v${VERSION}] Started listening for jobs...`);

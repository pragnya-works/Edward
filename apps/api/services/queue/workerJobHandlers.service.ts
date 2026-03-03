import {
  build,
  createBuild,
  db,
  eq,
  updateBuild,
} from "@edward/auth";
import { BuildRecordStatus } from "@edward/shared/api/contracts";
import type { Redis } from "ioredis";
import { buildAndUploadUnified } from "../sandbox/builder/unified-build/orchestrator.js";
import { backupSandboxInstance } from "../sandbox/backup.service.js";
import { getSandboxState } from "../sandbox/state.service.js";
import type {
  BackupJobPayload,
  BuildJobPayload,
} from "./queue.schemas.js";
import { enqueueBackupJob } from "./enqueue.js";
import { processAgentRunJob } from "../runs/agent-run-worker/processor.js";
import { createErrorReportIfPossible } from "../../queue.worker.helpers.js";
import {
  WORKER_BACKUP_JOB_TIMEOUT_MS,
  WORKER_BUILD_JOB_TIMEOUT_MS,
} from "../../utils/constants.js";
import { ensureError } from "../../utils/error.js";
import {
  isTerminalBuildStatus,
  publishBuildStatusWithRetry,
  toBuildStatus,
  withTimeout,
  type WorkerLogger,
} from "./workerPolicies.js";

interface BuildRecordSnapshot {
  id: string;
  status: BuildRecordStatus;
  previewUrl: string | null;
  errorReport: unknown;
}

export async function processBuildJob(params: {
  payload: BuildJobPayload;
  publishClient: Redis;
  logger: WorkerLogger;
}): Promise<void> {
  const { payload, publishClient, logger } = params;
  const { sandboxId, chatId, messageId, userId, runId } = payload;
  const correlationRunId = runId ?? messageId;
  const startTime = Date.now();

  const buildRecord = await resolveBuildRecord(payload);

  if (isTerminalBuildStatus(buildRecord.status)) {
    logger.info(
      {
        sandboxId,
        chatId,
        buildId: buildRecord.id,
        status: buildRecord.status,
      },
      "[Worker] Build already terminal, skipping duplicate execution",
    );

    await publishBuildStatusWithRetry({
      publishClient,
      logger,
      chatId,
      payload: {
        buildId: buildRecord.id,
        runId: correlationRunId,
        status: buildRecord.status,
        previewUrl: buildRecord.previewUrl,
        errorReport: buildRecord.errorReport,
      },
    });
    return;
  }

  await updateBuild(buildRecord.id, {
    status: BuildRecordStatus.BUILDING,
  });

  await publishBuildStatusWithRetry({
    publishClient,
    logger,
    chatId,
    payload: {
      buildId: buildRecord.id,
      runId: correlationRunId,
      status: BuildRecordStatus.BUILDING,
    },
  });

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

  let handledFailure = false;

  try {
    const result = await withTimeout(
      buildAndUploadUnified(sandboxId),
      WORKER_BUILD_JOB_TIMEOUT_MS,
      `Build execution timed out for sandbox ${sandboxId}`,
    );
    const duration = Date.now() - startTime;

    if (result.success) {
      await updateBuild(buildRecord.id, {
        status: BuildRecordStatus.SUCCESS,
        previewUrl: result.previewUrl,
        buildDuration: duration,
      });

      await publishBuildStatusWithRetry({
        publishClient,
        logger,
        chatId,
        payload: {
          buildId: buildRecord.id,
          runId: correlationRunId,
          status: BuildRecordStatus.SUCCESS,
          previewUrl: result.previewUrl,
        },
      });

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

      try {
        await enqueueBackupJob({ sandboxId, userId });
        logger.debug(
          { sandboxId },
          "[Worker] Backup job enqueued after successful build",
        );
      } catch (error) {
        logger.warn(
          { error: ensureError(error), sandboxId },
          "[Worker] Failed to enqueue post-build backup (non-fatal)",
        );
      }
      return;
    }

    logger.warn({ sandboxId, error: result.error }, "[Worker] Build failed");
    handledFailure = true;
    await finalizeBuildFailure({
      buildId: buildRecord.id,
      sandboxId,
      chatId,
      runId: correlationRunId,
      errorMessage: result.error,
      duration,
      publishClient,
      logger,
    });

    throw new Error(result.error ?? "Build failed without error message");
  } catch (error) {
    if (!handledFailure) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await finalizeBuildFailure({
        buildId: buildRecord.id,
        sandboxId,
        chatId,
        runId: correlationRunId,
        errorMessage,
        publishClient,
        logger,
      });
    }

    logger.error(
      { error: ensureError(error), sandboxId, chatId, runId: correlationRunId },
      "[Worker] Build job failed",
    );
    throw error;
  }
}

export async function processBackupJob(params: {
  payload: BackupJobPayload;
  logger: WorkerLogger;
}): Promise<void> {
  const { payload, logger } = params;
  const { sandboxId } = payload;

  try {
    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) {
      logger.warn({ sandboxId }, "[Worker] Sandbox not found for backup");
      return;
    }

    await withTimeout(
      backupSandboxInstance(sandbox),
      WORKER_BACKUP_JOB_TIMEOUT_MS,
      `Backup timed out for sandbox ${sandboxId}`,
    );
  } catch (error) {
    logger.error({ error: ensureError(error), sandboxId }, "[Worker] Backup job failed");
    throw error;
  }
}

export async function processAgentRun(params: {
  runId: string;
  publishClient: Redis;
}): Promise<void> {
  await processAgentRunJob(params.runId, params.publishClient);
}

async function resolveBuildRecord(
  payload: BuildJobPayload,
): Promise<BuildRecordSnapshot> {
  if (payload.buildId) {
    const [existing] = await db
      .select({
        id: build.id,
        status: build.status,
        previewUrl: build.previewUrl,
        errorReport: build.errorReport,
      })
      .from(build)
      .where(eq(build.id, payload.buildId))
      .limit(1);

    if (!existing) {
      throw new Error(`Build record ${payload.buildId} not found`);
    }

    return {
      id: existing.id,
      status: toBuildStatus(existing.status),
      previewUrl: existing.previewUrl,
      errorReport: existing.errorReport,
    };
  }

  const created = await createBuild({
    chatId: payload.chatId,
    messageId: payload.messageId,
    status: BuildRecordStatus.QUEUED,
  });
  if (!created) {
    throw new Error(`Failed to create/find build record for chatId: ${payload.chatId}`);
  }

  return {
    id: created.id,
    status: toBuildStatus(created.status),
    previewUrl: created.previewUrl,
    errorReport: created.errorReport,
  };
}

async function finalizeBuildFailure(params: {
  buildId: string;
  sandboxId: string;
  chatId: string;
  runId: string;
  errorMessage: string | undefined;
  duration?: number;
  publishClient: Redis;
  logger: WorkerLogger;
}): Promise<void> {
  const { errorReport } = await createErrorReportIfPossible(
    params.sandboxId,
    params.errorMessage,
    params.logger,
  );

  await updateBuild(params.buildId, {
    status: BuildRecordStatus.FAILED,
    errorReport: errorReport as Record<string, unknown> | null,
    buildDuration: params.duration ?? null,
  } as Parameters<typeof updateBuild>[1]).catch(() => {});

  await publishBuildStatusWithRetry({
    publishClient: params.publishClient,
    logger: params.logger,
    chatId: params.chatId,
    payload: {
      buildId: params.buildId,
      runId: params.runId,
      status: BuildRecordStatus.FAILED,
      errorReport,
    },
  });
}

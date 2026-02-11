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
import { enrichBuildError } from "./services/diagnostics/errorEnricher.js";
import { runAutoFix } from "./services/autofix/autofix.service.js";
import { getDecryptedApiKey } from "./services/apiKey.service.js";

const logger = createLogger("WORKER");
const pubClient = createRedisClient();

async function enrichErrorIfPossible(
  sandboxId: string,
  error: string | undefined,
): Promise<{ errorLog: string; errorMetadata: unknown }> {
  const errorLog = (error || "Unknown build error").slice(-2000);

  const sandbox = await getSandboxState(sandboxId);
  const containerId = sandbox?.containerId;

  if (!containerId || !error) {
    return { errorLog, errorMetadata: null };
  }

  try {
    const enriched = await enrichBuildError(
      sandboxId,
      error,
      containerId,
      sandbox?.scaffoldedFramework,
    );

    const primaryFile = enriched.diagnostics[0]?.file;
    const primaryCategory = enriched.diagnostics[0]?.category;

    logger.info(
      {
        sandboxId,
        method: enriched.method,
        category: primaryCategory,
        primaryFile,
        confidence: enriched.confidence,
        diagnosticCount: enriched.diagnostics.length,
      },
      "[Worker] Build error enriched with diagnostics",
    );

    return {
      errorLog: enriched.rawError.slice(-2000),
      errorMetadata: {
        diagnostics: enriched.diagnostics,
        method: enriched.method,
        confidence: enriched.confidence,
      } as unknown,
    };
  } catch (enrichErr) {
    logger.warn(
      { error: enrichErr, sandboxId },
      "[Worker] Error enrichment failed, using raw error",
    );
    return { errorLog, errorMetadata: null };
  }
}

async function processBuildJob(payload: BuildJobPayload): Promise<void> {
  const { sandboxId, chatId, messageId, userId } = payload;
  const startTime = Date.now();
  let apiKey: string | undefined;

  try {
    apiKey = await getDecryptedApiKey(userId);
  } catch (error) {
    logger.warn({ userId, error }, "[Worker] Failed to fetch API key for build job");
  }

  const buildRecord = await createBuild({
    chatId,
    messageId,
    status: "building",
  });

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
          status: "success",
          previewUrl: result.previewUrl,
        }),
      );

      logger.info(
        {
          sandboxId,
          buildDirectory: result.buildDirectory,
          previewUploaded: result.previewUploaded,
          previewUrl: result.previewUrl,
        },
        "[Worker] Build job completed with preview",
      );
      handled = true;
    } else {
      logger.info(
        { sandboxId, error: result.error },
        "[Worker] Build failed, attempting autofix",
      );

      const sandbox = await getSandboxState(sandboxId);
      let autofixSuccess = false;
      let retryResult: Awaited<ReturnType<typeof buildAndUploadUnified>> | undefined;

      if (sandbox?.containerId && apiKey) {
        try {
          const autofixResult = await runAutoFix({
            sandboxId,
            containerId: sandbox.containerId,
            apiKey,
            framework: sandbox.scaffoldedFramework,
          });

          if (autofixResult.success) {
            logger.info(
              { sandboxId, attempts: autofixResult.attempts.length },
              "[Worker] Autofix succeeded, retrying build",
            );

            retryResult = await buildAndUploadUnified(sandboxId);

            if (retryResult.success) {
              autofixSuccess = true;
              await updateBuild(buildRecord.id, {
                status: "success",
                previewUrl: retryResult.previewUrl,
                buildDuration: Date.now() - startTime,
              });

              await pubClient.publish(
                `edward:build-status:${chatId}`,
                JSON.stringify({
                  buildId: buildRecord.id,
                  status: "success",
                  previewUrl: retryResult.previewUrl,
                }),
              );

              logger.info(
                {
                  sandboxId,
                  buildDirectory: retryResult.buildDirectory,
                  previewUrl: retryResult.previewUrl,
                },
                "[Worker] Build succeeded after autofix",
              );
            } else {
              logger.warn(
                { sandboxId },
                "[Worker] Build still failed after autofix",
              );
            }
          } else {
            logger.warn(
              { sandboxId },
              "[Worker] Autofix did not resolve errors",
            );
          }
        } catch (autofixErr) {
          logger.warn(
            { error: autofixErr, sandboxId },
            "[Worker] Autofix failed",
          );
        }
      } else {
        logger.warn(
          {
            sandboxId,
            hasContainer: !!sandbox?.containerId,
            hasApiKey: !!apiKey,
          },
          "[Worker] Cannot run autofix: missing container or API key",
        );
      }

      if (!autofixSuccess) {
        const { errorLog, errorMetadata } = await enrichErrorIfPossible(
          sandboxId,
          autofixSuccess === false && typeof retryResult !== "undefined"
            ? retryResult.error
            : result.error,
        );

        await updateBuild(buildRecord.id, {
          status: "failed",
          errorLog,
          errorMetadata: errorMetadata as Record<string, unknown> | null,
          buildDuration: duration,
        });

        await pubClient.publish(
          `edward:build-status:${chatId}`,
          JSON.stringify({
            buildId: buildRecord.id,
            status: "failed",
            errorLog,
            errorMetadata,
          }),
        );

        logger.warn(
          {
            sandboxId,
            buildDirectory: result.buildDirectory,
            previewUploaded: result.previewUploaded,
            error: result.error,
          },
          "[Worker] Build job completed without preview",
        );
      }

      handled = true;

      if (!autofixSuccess) {
        throw new Error(result.error ?? "Build failed without error message");
      }
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
      const { errorLog, errorMetadata } = await enrichErrorIfPossible(
        sandboxId,
        err,
      );

      await updateBuild(buildRecord.id, {
        status: "failed",
        errorLog,
        errorMetadata: errorMetadata as Record<string, unknown> | null,
      }).catch(() => {});

      await pubClient
        .publish(
          `edward:build-status:${chatId}`,
          JSON.stringify({
            buildId: buildRecord.id,
            status: "failed",
            errorLog,
            errorMetadata,
          }),
        )
        .catch(() => {});
    }

    logger.error({ error, sandboxId }, "[Worker] Build job failed");
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

const worker = new Worker<JobPayload>(
  QUEUE_NAME,
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
          "[Worker] Unknown job type",
        );
        throw new Error(`Unknown job type: ${(payload as JobPayload).type}`);
    }
  },
  {
    connection,
    concurrency: 3,
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

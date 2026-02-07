import 'dotenv/config';
import { Worker } from 'bullmq';
import {
  JobPayloadSchema,
  JobPayload,
  JobType,
  BuildJobPayload,
  BackupJobPayload,
  CleanupJobPayload,
} from './services/queue/queue.schemas.js';
import { createLogger } from './utils/logger.js';
import { VERSION } from './utils/constants.js';
import { connection, QUEUE_NAME } from './lib/queue.js';
import { buildAndUploadUnified } from './services/sandbox/builder/unified.build.js';
import { backupSandboxInstance } from './services/sandbox/backup.sandbox.js';
import { getSandboxState } from './services/sandbox/state.sandbox.js';
import { cleanupSandbox } from './services/sandbox/lifecycle/cleanup.js';
import { createBuild, updateBuild } from '@edward/auth';
import { enqueueBackupJob } from './services/queue/enqueue.js';
import { Redis } from 'ioredis';

const logger = createLogger('WORKER');
const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

async function processBuildJob(payload: BuildJobPayload): Promise<void> {
  const { sandboxId, chatId, messageId, userId } = payload;
  const startTime = Date.now();

  const buildRecord = await createBuild({
    chatId,
    messageId,
    status: 'building',
  });

  let handled = false;

  try {
    const result = await buildAndUploadUnified(sandboxId);
    const duration = Date.now() - startTime;

    if (result.success) {
      await updateBuild(buildRecord.id, {
        status: 'success',
        previewUrl: result.previewUrl,
        buildDuration: duration,
      });

      await pubClient.publish(`edward:build-status:${chatId}`, JSON.stringify({
        buildId: buildRecord.id,
        status: 'success',
        previewUrl: result.previewUrl,
      }));

      logger.info({
        sandboxId,
        buildDirectory: result.buildDirectory,
        previewUploaded: result.previewUploaded,
        previewUrl: result.previewUrl
      }, '[Worker] Build job completed with preview');
      handled = true;
    } else {
      const errorLog = result.error?.slice(-2000) || 'Unknown build error';
      await updateBuild(buildRecord.id, {
        status: 'failed',
        errorLog,
        buildDuration: duration,
      });

      await pubClient.publish(`edward:build-status:${chatId}`, JSON.stringify({
        buildId: buildRecord.id,
        status: 'failed',
        errorLog,
      }));

      logger.warn({
        sandboxId,
        buildDirectory: result.buildDirectory,
        previewUploaded: result.previewUploaded,
        error: result.error
      }, '[Worker] Build job completed without preview');
      handled = true;
    }

    if (!result.success) {
      throw new Error(result.error ?? 'Build failed without error message');
    }

    try {
      await enqueueBackupJob({ sandboxId, userId });
      logger.debug({ sandboxId }, '[Worker] Backup job enqueued after successful build');
    } catch (backupErr) {
      logger.warn({ error: backupErr, sandboxId }, '[Worker] Failed to enqueue post-build backup (non-fatal)');
    }
  } catch (error) {
    if (!handled) {
      const err = error instanceof Error ? error.message : String(error);
      await updateBuild(buildRecord.id, {
        status: 'failed',
        errorLog: err.slice(-2000),
      }).catch(() => { });

      await pubClient.publish(`edward:build-status:${chatId}`, JSON.stringify({
        buildId: buildRecord.id,
        status: 'failed',
        errorLog: err.slice(-2000),
      })).catch(() => { });
    }

    logger.error({ error, sandboxId }, '[Worker] Build job failed');
    throw error;
  }
}

async function processBackupJob(payload: BackupJobPayload): Promise<void> {
  const { sandboxId } = payload;

  try {
    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) {
      logger.warn({ sandboxId }, '[Worker] Sandbox not found for backup');
      return;
    }

    await backupSandboxInstance(sandbox);
  } catch (error) {
    logger.error({ error, sandboxId }, '[Worker] Backup job failed');
    throw error;
  }
}

async function processCleanupJob(payload: CleanupJobPayload): Promise<void> {
  const { sandboxId } = payload;

  try {
    await cleanupSandbox(sandboxId);
  } catch (error) {
    logger.error({ error, sandboxId }, '[Worker] Cleanup job failed');
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
      case JobType.CLEANUP:
        return processCleanupJob(payload);
      default:
        logger.error({ type: (payload as JobPayload).type }, '[Worker] Unknown job type');
        throw new Error(`Unknown job type: ${(payload as JobPayload).type}`);
    }
  },
  {
    connection,
    concurrency: 3,
  }
);

worker.on('completed', (job) => {
  logger.debug({ jobId: job.id, jobName: job.name }, '[Worker] Job completed');
});

worker.on('failed', (job, error) => {
  logger.error({ error, jobId: job?.id, jobName: job?.name }, '[Worker] Job failed');
});

worker.on('error', (error) => {
  logger.error({ error }, '[Worker] Worker error');
});

async function gracefulShutdown() {
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

logger.info(`[Worker v${VERSION}] Started listening for jobs...`);
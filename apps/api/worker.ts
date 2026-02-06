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

const logger = createLogger('WORKER');

async function processBuildJob(payload: BuildJobPayload): Promise<void> {
  const { sandboxId } = payload;
  
  try {
    const result = await buildAndUploadUnified(sandboxId);
    if (result.success) {
      logger.info({
        sandboxId,
        buildDirectory: result.buildDirectory,
        previewUploaded: result.previewUploaded,
        previewUrl: result.previewUrl
      }, '[Worker] Build job completed with preview');
    } else {
      logger.warn({
        sandboxId,
        buildDirectory: result.buildDirectory,
        previewUploaded: result.previewUploaded,
        error: result.error
      }, '[Worker] Build job completed without preview');
    }
    
    if (!result.success) {
      throw new Error(result.error ?? 'Build failed without error message');
    }
  } catch (error) {
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
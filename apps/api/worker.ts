import 'dotenv/config';
import { Worker } from 'bullmq';
import { 
  JobPayloadSchema, 
  JobPayload, 
  JobType,
  BuildJobPayload,
  BackupJobPayload,
  CleanupJobPayload,
} from './services/queue.service.js';
import { createLogger } from './utils/logger.js';
import { VERSION } from './utils/constants.js';
import { connection, QUEUE_NAME } from './lib/queue.js';
import { buildAndUploadUnified } from './services/sandbox/builder/unified.build.js';
import { backupSandboxInstance } from './services/sandbox/backup.sandbox.js';
import { cleanupSandbox } from './services/sandbox/lifecycle.sandbox.js';
import { getSandboxState } from './services/sandbox/state.sandbox.js';

const logger = createLogger('WORKER');

async function processBuildJob(payload: BuildJobPayload): Promise<void> {
  const { sandboxId, userId, chatId } = payload;
  
  logger.info({ sandboxId, userId, chatId }, '[Worker] Starting build job');
  
  try {
    const result = await buildAndUploadUnified(sandboxId);
    
    if (result.success) {
      logger.info({ 
        sandboxId, 
        previewUrl: result.previewUrl 
      }, '[Worker] Build completed successfully');
    } else {
      logger.error({ 
        sandboxId, 
        error: result.error 
      }, '[Worker] Build failed');
      throw new Error(result.error ?? 'Build failed without error message');
    }
  } catch (error) {
    logger.error({ error, sandboxId }, '[Worker] Build job threw exception');
    throw error;
  }
}

async function processBackupJob(payload: BackupJobPayload): Promise<void> {
  const { sandboxId, userId } = payload;
  
  logger.info({ sandboxId, userId }, '[Worker] Starting backup job');
  
  try {
    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) {
      logger.warn({ sandboxId }, '[Worker] Sandbox not found for backup');
      return;
    }
    
    await backupSandboxInstance(sandbox);
    logger.info({ sandboxId }, '[Worker] Backup completed successfully');
  } catch (error) {
    logger.error({ error, sandboxId }, '[Worker] Backup job failed');
    throw error;
  }
}

async function processCleanupJob(payload: CleanupJobPayload): Promise<void> {
  const { sandboxId, userId, reason } = payload;
  
  logger.info({ sandboxId, userId, reason }, '[Worker] Starting cleanup job');
  
  try {
    await cleanupSandbox(sandboxId);
    logger.info({ sandboxId, reason }, '[Worker] Cleanup completed successfully');
  } catch (error) {
    logger.error({ error, sandboxId }, '[Worker] Cleanup job failed');
    throw error;
  }
}

const worker = new Worker<JobPayload>(
  QUEUE_NAME,
  async (job) => {
    const payload = JobPayloadSchema.parse(job.data);
    
    logger.debug({ 
      jobId: job.id, 
      jobName: job.name, 
      type: payload.type 
    }, '[Worker] Processing job');
    
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
  logger.info({ 
    jobId: job.id, 
    jobName: job.name,
    duration: Date.now() - job.timestamp
  }, '[Worker] Job completed');
});

worker.on('failed', (job, error) => {
  logger.error({ 
    error, 
    jobId: job?.id, 
    jobName: job?.name,
    attempts: job?.attemptsMade
  }, '[Worker] Job failed');
});

worker.on('error', (error) => {
  logger.error({ error }, '[Worker] Worker error');
});

async function gracefulShutdown() {
  logger.info('[Worker] Shutting down...');
  await worker.close();
  logger.info('[Worker] Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

logger.info(`[Worker v${VERSION}] Started listening for jobs...`);
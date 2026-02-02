import { logger } from '../../utils/logger.js';
import { getQueue, createQueueJobId } from './queue.client.js';
import {
  JobType,
  BuildJobPayloadSchema,
  BackupJobPayloadSchema,
  CleanupJobPayloadSchema,
  BuildJobPayload,
  BackupJobPayload,
  CleanupJobPayload,
} from './queue.schemas.js';

const queue = getQueue();

export async function enqueueBuildJob(payload: Omit<BuildJobPayload, 'type'>): Promise<string> {
  const fullPayload: BuildJobPayload = { ...payload, type: JobType.BUILD };
  const validated = BuildJobPayloadSchema.parse(fullPayload);

  try {
    const job = await queue.add(JobType.BUILD, validated, {
      jobId: createQueueJobId('build', validated.sandboxId),
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    return job.id!;
  } catch (error) {
    logger.error(error, '[Queue] Failed to enqueue build job');
    throw new Error('Failed to enqueue build job');
  }
}

export async function enqueueBackupJob(payload: Omit<BackupJobPayload, 'type'>): Promise<string> {
  const fullPayload: BackupJobPayload = { ...payload, type: JobType.BACKUP };
  const validated = BackupJobPayloadSchema.parse(fullPayload);

  try {
    const job = await queue.add(JobType.BACKUP, validated, {
      jobId: createQueueJobId('backup', validated.sandboxId),
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      attempts: 2,
      backoff: { type: 'fixed', delay: 1000 },
    });

    return job.id!;
  } catch (error) {
    logger.error(error, '[Queue] Failed to enqueue backup job');
    throw new Error('Failed to enqueue backup job');
  }
}

export async function enqueueCleanupJob(payload: Omit<CleanupJobPayload, 'type'>): Promise<string> {
  const fullPayload: CleanupJobPayload = { ...payload, type: JobType.CLEANUP };
  const validated = CleanupJobPayloadSchema.parse(fullPayload);

  try {
    const job = await queue.add(JobType.CLEANUP, validated, {
      jobId: createQueueJobId('cleanup', validated.sandboxId),
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 20 },
      attempts: 2,
      delay: 1000,
    });

    return job.id!;
  } catch (error) {
    logger.error(error, '[Queue] Failed to enqueue cleanup job');
    throw new Error('Failed to enqueue cleanup job');
  }
}

import { Queue, Job } from 'bullmq';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { connection, QUEUE_NAME } from '../lib/queue.js';

export enum JobType {
  BUILD = 'build',
  BACKUP = 'backup',
  CLEANUP = 'cleanup',
}

export const BuildJobPayloadSchema = z.object({
  type: z.literal(JobType.BUILD),
  sandboxId: z.string(),
  userId: z.string(),
  chatId: z.string(),
});
export type BuildJobPayload = z.infer<typeof BuildJobPayloadSchema>;

export const BackupJobPayloadSchema = z.object({
  type: z.literal(JobType.BACKUP),
  sandboxId: z.string(),
  userId: z.string(),
});
export type BackupJobPayload = z.infer<typeof BackupJobPayloadSchema>;

export const CleanupJobPayloadSchema = z.object({
  type: z.literal(JobType.CLEANUP),
  sandboxId: z.string(),
  userId: z.string(),
  reason: z.string().optional(),
});
export type CleanupJobPayload = z.infer<typeof CleanupJobPayloadSchema>;

export const JobPayloadSchema = z.discriminatedUnion('type', [
  BuildJobPayloadSchema,
  BackupJobPayloadSchema,
  CleanupJobPayloadSchema,
]);
export type JobPayload = z.infer<typeof JobPayloadSchema>;

export type TypedJob<T extends JobPayload = JobPayload> = Job<T>;

const jobQueue = new Queue<JobPayload>(QUEUE_NAME, { connection });

export async function enqueueBuildJob(payload: Omit<BuildJobPayload, 'type'>): Promise<string> {
  const fullPayload: BuildJobPayload = { ...payload, type: JobType.BUILD };
  const validated = BuildJobPayloadSchema.parse(fullPayload);

  try {
    const job = await jobQueue.add(JobType.BUILD, validated, {
      jobId: `build-${validated.sandboxId}-${Date.now()}`,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    logger.info({ 
      jobId: job.id, 
      sandboxId: validated.sandboxId, 
      userId: validated.userId 
    }, '[Queue] Build job enqueued');

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
    const job = await jobQueue.add(JobType.BACKUP, validated, {
      jobId: `backup-${validated.sandboxId}-${Date.now()}`,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      attempts: 2,
      backoff: { type: 'fixed', delay: 1000 },
    });

    logger.info({ 
      jobId: job.id, 
      sandboxId: validated.sandboxId 
    }, '[Queue] Backup job enqueued');

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
    const job = await jobQueue.add(JobType.CLEANUP, validated, {
      jobId: `cleanup-${validated.sandboxId}-${Date.now()}`,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 20 },
      attempts: 2,
      delay: 1000,
    });

    logger.info({ 
      jobId: job.id, 
      sandboxId: validated.sandboxId,
      reason: validated.reason 
    }, '[Queue] Cleanup job enqueued');

    return job.id!;
  } catch (error) {
    logger.error(error, '[Queue] Failed to enqueue cleanup job');
    throw new Error('Failed to enqueue cleanup job');
  }
}

export function getQueue(): Queue<JobPayload> {
  return jobQueue;
}
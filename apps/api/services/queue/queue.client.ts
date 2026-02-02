import { Queue, Job } from 'bullmq';
import { connection, QUEUE_NAME } from '../../lib/queue.js';
import { JobPayload } from './queue.schemas.js';

export type TypedJob<T extends JobPayload = JobPayload> = Job<T>;

const jobQueue = new Queue<JobPayload>(QUEUE_NAME, { connection });

export function getQueue(): Queue<JobPayload> {
  return jobQueue;
}

export function createQueueJobId(prefix: string, sandboxId: string): string {
  return `${prefix}-${sandboxId}-${Date.now()}`;
}

import { Queue, Job } from 'bullmq';
import {
  AGENT_RUN_QUEUE_NAME,
  BUILD_QUEUE_NAME,
  connection,
} from '../../lib/queue.binding.js';
import { JobPayload } from './queue.schemas.js';

export type TypedJob<T extends JobPayload = JobPayload> = Job<T>;

const buildQueue = new Queue<JobPayload>(BUILD_QUEUE_NAME, { connection });
const agentRunQueue = new Queue<JobPayload>(AGENT_RUN_QUEUE_NAME, { connection });

export function getBuildQueue(): Queue<JobPayload> {
  return buildQueue;
}

export function getAgentRunQueue(): Queue<JobPayload> {
  return agentRunQueue;
}

export function createQueueJobId(
  prefix: string,
  sandboxId: string,
  identifier?: string,
): string {
  if (!identifier) {
    return `${prefix}-${sandboxId}-${Date.now()}`;
  }

  const normalizedIdentifier = identifier.replace(/[^a-zA-Z0-9:_-]/g, "_");
  return `${prefix}-${sandboxId}-${normalizedIdentifier}`;
}

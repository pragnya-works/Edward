import { Queue } from "bullmq";
import {
  AGENT_RUN_QUEUE_NAME,
  BUILD_QUEUE_NAME,
  connection,
} from "../../lib/queue.binding.js";
import { JobPayload } from "./queue.schemas.js";

export const buildQueue = new Queue<JobPayload>(BUILD_QUEUE_NAME, { connection });
export const agentRunQueue = new Queue<JobPayload>(AGENT_RUN_QUEUE_NAME, { connection });

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

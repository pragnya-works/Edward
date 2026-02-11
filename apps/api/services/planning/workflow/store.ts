import { redis } from "../../../lib/redis.js";
import { logger } from "../../../utils/logger.js";
import { WorkflowState, WorkflowStateSchema } from "../schemas.js";

const WORKFLOW_PREFIX = "edward:workflow:";
const CHAT_WORKFLOW_PREFIX = "edward:chat-workflow:";
const WORKFLOW_TTL_SECONDS = 3600;

export async function getWorkflow(id: string): Promise<WorkflowState | null> {
  const data = await redis.get(`${WORKFLOW_PREFIX}${id}`);
  if (!data) return null;

  try {
    const parsed = WorkflowStateSchema.safeParse(JSON.parse(data));
    if (!parsed.success) {
      logger.warn(
        { workflowId: id, parseErrors: parsed.error.errors },
        "Invalid workflow schema, deleting corrupted data",
      );
      await redis.del(`${WORKFLOW_PREFIX}${id}`).catch(() => {});
      return null;
    }
    return parsed.data;
  } catch (error) {
    logger.error(
      { error, workflowId: id },
      "Malformed JSON in Redis, deleting corrupted data",
    );
    await redis.del(`${WORKFLOW_PREFIX}${id}`).catch(() => {});
    return null;
  }
}

export async function saveWorkflow(state: WorkflowState): Promise<void> {
  state.updatedAt = Date.now();
  await redis.set(
    `${WORKFLOW_PREFIX}${state.id}`,
    JSON.stringify(state),
    "EX",
    WORKFLOW_TTL_SECONDS,
  );
  await redis.set(
    `${CHAT_WORKFLOW_PREFIX}${state.chatId}`,
    state.id,
    "EX",
    WORKFLOW_TTL_SECONDS,
  );
}

export async function deleteWorkflow(id: string): Promise<void> {
  const workflow = await getWorkflow(id);
  if (workflow) {
    await redis.del(`${CHAT_WORKFLOW_PREFIX}${workflow.chatId}`);
  }
  await redis.del(`${WORKFLOW_PREFIX}${id}`);
}

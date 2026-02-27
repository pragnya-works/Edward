import { nanoid } from "nanoid";
import { logger } from "../../../../../utils/logger.js";
import type { WorkflowContext, WorkflowState } from "../../../schemas.js";
import { WorkflowStatus, WorkflowStep } from "../../../schemas.js";
import { getActiveSandbox } from "../../../../sandbox/lifecycle/provisioning.js";
import { saveWorkflow } from "../../store.js";

export async function createWorkflow(
  userId: string,
  chatId: string,
  initialContext: Partial<WorkflowContext> = {},
): Promise<WorkflowState> {
  let sandboxId: string | undefined;
  try {
    sandboxId = await getActiveSandbox(chatId);
  } catch (sandboxLookupError) {
    logger.warn(
      {
        chatId,
        error: sandboxLookupError instanceof Error
          ? sandboxLookupError.message
          : String(sandboxLookupError),
      },
      "Failed to hydrate active sandbox while creating workflow",
    );
  }

  const state: WorkflowState = {
    id: nanoid(16),
    userId,
    chatId,
    sandboxId,
    status: WorkflowStatus.PENDING,
    currentStep: WorkflowStep.ANALYZE,
    context: { errors: [], ...initialContext },
    history: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveWorkflow(state);
  return state;
}

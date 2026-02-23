import { logger } from "../../../utils/logger.js";
import {
  WorkflowStatus,
  WorkflowStep,
  type StepResult,
  type WorkflowState,
} from "../schemas.js";
import { PHASE_CONFIGS } from "./config.js";
import { getWorkflow, saveWorkflow, deleteWorkflow } from "./store.js";
import { cleanupSandbox } from "../../sandbox/lifecycle/cleanup.js";
import { createWorkflow as createWorkflowState, executeStep } from "./steps.js";
import { withRetry } from "./retry.js";

export async function createWorkflow(
  userId: string,
  chatId: string,
  initialContext: Partial<WorkflowState["context"]> = {},
): Promise<WorkflowState> {
  return createWorkflowState(userId, chatId, initialContext);
}

export async function advanceWorkflow(
  state: WorkflowState,
  stepInput?: unknown,
): Promise<StepResult> {
  if (
    state.status === WorkflowStatus.COMPLETED ||
    state.status === WorkflowStatus.FAILED
  ) {
    return {
      step: state.currentStep,
      success: false,
      error: `Workflow already ${state.status}`,
      durationMs: 0,
      retryCount: 0,
    };
  }

  state.status = WorkflowStatus.RUNNING;
  await saveWorkflow(state);

  const config = PHASE_CONFIGS.find((phase) => phase.name === state.currentStep);
  const maxRetries = config?.maxRetries || 3;

  const result = await withRetry(
    () => executeStep(state, state.currentStep, stepInput),
    maxRetries,
    state.currentStep,
  );

  state.history.push(result);

  if (!result.success) {
    const isRecoverable =
      state.currentStep !== WorkflowStep.RECOVER &&
      result.retryCount < maxRetries;

    if (isRecoverable) {
      state.currentStep = WorkflowStep.RECOVER;
    } else {
      state.status = WorkflowStatus.FAILED;
    }
  } else {
    const stepOrder = PHASE_CONFIGS.filter(
      (phase) => phase.name !== WorkflowStep.RECOVER,
    ).map((phase) => phase.name);

    let currentIndex = stepOrder.indexOf(state.currentStep);

    if (currentIndex === -1 && state.currentStep === WorkflowStep.RECOVER) {
      const lastSuccess = state.history.findLast(
        (history) => history.success && history.step !== WorkflowStep.RECOVER,
      );
      currentIndex = lastSuccess ? stepOrder.indexOf(lastSuccess.step) : -1;
      if (currentIndex === -1) {
        currentIndex = stepOrder.indexOf(WorkflowStep.ANALYZE) - 1;
      }
    }

    if (
      currentIndex === stepOrder.length - 1 ||
      state.currentStep === WorkflowStep.DEPLOY
    ) {
      state.status = WorkflowStatus.COMPLETED;
    } else if (currentIndex >= 0 && currentIndex + 1 < stepOrder.length) {
      state.currentStep = stepOrder[currentIndex + 1]!;
    } else if (currentIndex === -1 && stepOrder.length > 0) {
      state.currentStep = stepOrder[0]!;
    } else {
      state.status = WorkflowStatus.FAILED;
      logger.error(
        {
          workflowId: state.id,
          currentStep: state.currentStep,
          currentIndex,
        },
        "Workflow in unexpected state during advancement",
      );
    }
  }

  await saveWorkflow(state);
  const logMethod = result.success ? "info" : "error";

  logger[logMethod](
    {
      workflowId: state.id,
      step: result.step,
      success: result.success,
      error: result.success ? undefined : result.error,
      nextStep: state.currentStep,
      status: state.status,
    },
    `Workflow step ${result.success ? "completed" : "failed"}`,
  );

  return result;
}

export async function getWorkflowStatus(
  id: string,
): Promise<WorkflowState | null> {
  return getWorkflow(id);
}

export async function cancelWorkflow(id: string): Promise<boolean> {
  const state = await getWorkflow(id);
  if (!state) {
    return false;
  }

  if (state.sandboxId) {
    await cleanupSandbox(state.sandboxId).catch((err: unknown) =>
      logger.error(
        { err, workflowId: id },
        "Failed to cleanup sandbox on cancel",
      ),
    );
  }

  await deleteWorkflow(id);
  return true;
}

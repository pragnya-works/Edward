import type {
  Framework,
  StepResult,
  WorkflowContext,
  WorkflowState,
} from "../schemas.js";
import type { WorkflowStepType } from "../schemas.js";
import {
  createWorkflow as createWorkflowRunner,
  ensureSandbox as ensureSandboxRunner,
  executeAnalyzePhase as executeAnalyzePhaseRunner,
  executeBuildPhase as executeBuildPhaseRunner,
  executeInstallPhase as executeInstallPhaseRunner,
  executePackageResolution as executePackageResolutionRunner,
  executeStep as executeStepRunner,
} from "./internal/workflowSteps.runner.js";

export async function createWorkflow(
  userId: string,
  chatId: string,
  initialContext: Partial<WorkflowContext> = {},
): Promise<WorkflowState> {
  return createWorkflowRunner(userId, chatId, initialContext);
}

export async function executePackageResolution(
  state: WorkflowState,
  packages: string[],
): Promise<StepResult> {
  return executePackageResolutionRunner(state, packages);
}

export async function ensureSandbox(
  state: WorkflowState,
  framework?: Framework,
  shouldRestore: boolean = false,
): Promise<string> {
  return ensureSandboxRunner(state, framework, shouldRestore);
}

export async function executeInstallPhase(
  state: WorkflowState,
): Promise<StepResult> {
  return executeInstallPhaseRunner(state);
}

export async function executeBuildPhase(
  state: WorkflowState,
): Promise<StepResult> {
  return executeBuildPhaseRunner(state);
}

export async function executeAnalyzePhase(
  state: WorkflowState,
  userRequest: string,
): Promise<StepResult> {
  return executeAnalyzePhaseRunner(state, userRequest);
}

export async function executeStep(
  state: WorkflowState,
  step: WorkflowStepType,
  input?: unknown,
): Promise<StepResult> {
  return executeStepRunner(state, step, input);
}

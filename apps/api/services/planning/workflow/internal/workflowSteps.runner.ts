import type { StepResult, WorkflowState } from "../../schemas.js";
import {
  WorkflowStep,
  type WorkflowStepType,
} from "../../schemas.js";
import { acquireLock, releaseLock } from "../locks.js";
import { createWorkflow as createWorkflowInternal } from "./workflowSteps/createWorkflow.js";
import { executePackageResolution as executePackageResolutionInternal } from "./workflowSteps/executePackageResolution.js";
import { ensureSandbox as ensureSandboxInternal } from "./workflowSteps/ensureSandbox.js";
import { executeInstallPhase as executeInstallPhaseInternal } from "./workflowSteps/executeInstallPhase.js";
import { executeBuildPhase as executeBuildPhaseInternal } from "./workflowSteps/executeBuildPhase.js";
import { executeAnalyzePhase as executeAnalyzePhaseInternal } from "./workflowSteps/executeAnalyzePhase.js";

export async function createWorkflow(
  ...args: Parameters<typeof createWorkflowInternal>
): ReturnType<typeof createWorkflowInternal> {
  return createWorkflowInternal(...args);
}

export async function executePackageResolution(
  ...args: Parameters<typeof executePackageResolutionInternal>
): ReturnType<typeof executePackageResolutionInternal> {
  return executePackageResolutionInternal(...args);
}

export async function ensureSandbox(
  ...args: Parameters<typeof ensureSandboxInternal>
): ReturnType<typeof ensureSandboxInternal> {
  return ensureSandboxInternal(...args);
}

export async function executeInstallPhase(
  ...args: Parameters<typeof executeInstallPhaseInternal>
): ReturnType<typeof executeInstallPhaseInternal> {
  return executeInstallPhaseInternal(...args);
}

export async function executeBuildPhase(
  ...args: Parameters<typeof executeBuildPhaseInternal>
): ReturnType<typeof executeBuildPhaseInternal> {
  return executeBuildPhaseInternal(...args);
}

export async function executeAnalyzePhase(
  ...args: Parameters<typeof executeAnalyzePhaseInternal>
): ReturnType<typeof executeAnalyzePhaseInternal> {
  return executeAnalyzePhaseInternal(...args);
}

export async function executeStep(
  state: WorkflowState,
  step: WorkflowStepType,
  input?: unknown,
): Promise<StepResult> {
  const startTime = Date.now();

  switch (step) {
    case WorkflowStep.RESOLVE_PACKAGES: {
      const lockId = await acquireLock(`resolve:${state.id}`);
      if (!lockId) {
        return {
          step,
          success: false,
          error: "Resolution already in progress",
          durationMs: 0,
          retryCount: 0,
        };
      }

      try {
        return await executePackageResolutionInternal(state, (input as string[]) || []);
      } finally {
        await releaseLock(`resolve:${state.id}`, lockId);
      }
    }

    case WorkflowStep.ANALYZE:
      return executeAnalyzePhaseInternal(state, (input as string) || "");

    case WorkflowStep.INSTALL_PACKAGES:
      return executeInstallPhaseInternal(state);

    case WorkflowStep.BUILD:
      return executeBuildPhaseInternal(state);

    case WorkflowStep.DEPLOY:
      return {
        step: WorkflowStep.DEPLOY,
        success: !!state.context.previewUrl,
        data: { previewUrl: state.context.previewUrl },
        durationMs: Date.now() - startTime,
        retryCount: 0,
      };

    default:
      return {
        step,
        success: true,
        data: { message: `Step ${step} executed` },
        durationMs: Date.now() - startTime,
        retryCount: 0,
      };
  }
}

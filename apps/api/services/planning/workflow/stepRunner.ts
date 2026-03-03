import type { StepResult, WorkflowState } from "../schemas.js";
import {
  WorkflowStep,
  type WorkflowStepType,
} from "../schemas.js";
import { acquireLock, releaseLock } from "./locks.js";
import { executePackageResolution as executePackageResolutionInternal } from "./steps/executePackageResolution.js";
import { executeInstallPhase as executeInstallPhaseInternal } from "./steps/executeInstallPhase.js";
import { executeBuildPhase as executeBuildPhaseInternal } from "./steps/executeBuildPhase.js";
import { executeAnalyzePhase as executeAnalyzePhaseInternal } from "./steps/executeAnalyzePhase.js";

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

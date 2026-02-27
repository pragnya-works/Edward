import type { StepResult, WorkflowState } from "../../../schemas.js";
import { WorkflowStep } from "../../../schemas.js";
import { runValidationPipeline } from "../../../../validation/pipeline.js";
import { getSandboxState } from "../../../../sandbox/state.service.js";
import { buildAndUploadUnified } from "../../../../sandbox/builder/unified.build.js";
import { acquireLock, releaseLock } from "../../locks.js";

export async function executeBuildPhase(
  state: WorkflowState,
): Promise<StepResult> {
  const startTime = Date.now();

  if (!state.sandboxId) {
    return {
      step: WorkflowStep.BUILD,
      success: false,
      error: "No sandbox available for build",
      durationMs: Date.now() - startTime,
      retryCount: 0,
    };
  }

  try {
    const sandbox = await getSandboxState(state.sandboxId);
    if (!sandbox) {
      return {
        step: WorkflowStep.BUILD,
        success: false,
        error: "Sandbox state not found",
        durationMs: Date.now() - startTime,
        retryCount: 0,
      };
    }

    const validationResult = await runValidationPipeline(
      sandbox.containerId,
      state.sandboxId,
    );

    if (!validationResult.valid) {
      state.context.errors.push(
        ...validationResult.errors.map((e) => e.message),
      );
      return {
        step: WorkflowStep.BUILD,
        success: false,
        error: `Validation failed at ${validationResult.stage}`,
        data: {
          errors: validationResult.errors,
          retryPrompt: validationResult.retryPrompt,
        },
        durationMs: Date.now() - startTime,
        retryCount: 0,
      };
    }

    const lockId = await acquireLock(`build:${state.sandboxId}`);
    if (!lockId) {
      return {
        step: WorkflowStep.BUILD,
        success: false,
        error: "Build already in progress",
        durationMs: Date.now() - startTime,
        retryCount: 0,
      };
    }

    try {
      const buildResult = await buildAndUploadUnified(state.sandboxId);

      if (!buildResult.success) {
        return {
          step: WorkflowStep.BUILD,
          success: false,
          error: buildResult.error,
          durationMs: Date.now() - startTime,
          retryCount: 0,
        };
      }

      state.context.buildDirectory = buildResult.buildDirectory || undefined;
      state.context.previewUrl = buildResult.previewUrl || undefined;

      return {
        step: WorkflowStep.BUILD,
        success: true,
        data: { previewUrl: buildResult.previewUrl },
        durationMs: Date.now() - startTime,
        retryCount: 0,
      };
    } finally {
      await releaseLock(`build:${state.sandboxId}`, lockId);
    }
  } catch (error) {
    return {
      step: WorkflowStep.BUILD,
      success: false,
      error: error instanceof Error ? error.message : "Build failed",
      durationMs: Date.now() - startTime,
      retryCount: 0,
    };
  }
}

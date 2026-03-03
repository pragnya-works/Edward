import { logger } from "../../../../utils/logger.js";
import type { PackageInfo, StepResult, WorkflowState } from "../../schemas.js";
import { WorkflowStep } from "../../schemas.js";
import { resolvePackages } from "../../../registry/package.registry.js";

export async function executePackageResolution(
  state: WorkflowState,
  packages: string[],
): Promise<StepResult> {
  const startTime = Date.now();

  try {
    const { valid, invalid, conflicts } = await resolvePackages(packages);

    if (invalid.length > 0) {
      const errorMsg = `Invalid packages: ${invalid.map((p) => `${p.name} (${p.error})`).join(", ")}`;
      state.context.errors.push(errorMsg);
      return {
        step: WorkflowStep.RESOLVE_PACKAGES,
        success: false,
        error: errorMsg,
        durationMs: Date.now() - startTime,
        retryCount: 0,
      };
    }

    if (conflicts.length > 0) {
      logger.warn({ conflicts }, "Peer dependency conflicts detected");
    }

    state.context.resolvedPackages = valid.map((v) => ({
      name: v.name,
      version: v.version || "latest",
      valid: v.valid,
      error: v.error,
      peerDependencies: v.peerDependencies,
    })) as PackageInfo[];

    return {
      step: WorkflowStep.RESOLVE_PACKAGES,
      success: true,
      data: { resolved: valid.length, conflicts },
      durationMs: Date.now() - startTime,
      retryCount: 0,
    };
  } catch (error) {
    return {
      step: WorkflowStep.RESOLVE_PACKAGES,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
      retryCount: 0,
    };
  }
}

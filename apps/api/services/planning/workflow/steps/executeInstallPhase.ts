import { logger } from "../../../../utils/logger.js";
import type { StepResult, WorkflowState } from "../../schemas.js";
import { WorkflowStep } from "../../schemas.js";
import { getSandboxState } from "../../../sandbox/state.service.js";
import { mergeAndInstallDependencies } from "../../../sandbox/templates/dependency.merger.js";
import { connectToNetwork } from "../../../sandbox/docker.service.js";
import { disconnectContainerFromNetwork } from "../../../sandbox/utils.service.js";
import { formatPackageSpec } from "../../../packages/packageSpec.js";

export async function executeInstallPhase(
  state: WorkflowState,
): Promise<StepResult> {
  const startTime = Date.now();

  if (!state.sandboxId) {
    return {
      step: WorkflowStep.INSTALL_PACKAGES,
      success: false,
      error: "No sandbox available for installation",
      durationMs: Date.now() - startTime,
      retryCount: 0,
    };
  }

  try {
    const sandbox = await getSandboxState(state.sandboxId);
    if (!sandbox) {
      return {
        step: WorkflowStep.INSTALL_PACKAGES,
        success: false,
        error: "Sandbox state not found",
        durationMs: Date.now() - startTime,
        retryCount: 0,
      };
    }

    const packageSpecs = (state.context.resolvedPackages || [])
      .filter((pkg) => pkg.valid)
      .map((pkg) => formatPackageSpec(pkg.name, pkg.version));

    await connectToNetwork(sandbox.containerId);

    let installSuccess = false;
    let installResult: {
      success: boolean;
      error?: string;
      warnings?: string[];
    } = { success: false };
    let installError: Error | null = null;

    try {
      installResult = await mergeAndInstallDependencies(
        sandbox.containerId,
        packageSpecs,
        state.sandboxId,
      );
      installSuccess = installResult.success;
    } catch (error) {
      installError = error instanceof Error ? error : new Error(String(error));
    }

    try {
      await disconnectContainerFromNetwork(
        sandbox.containerId,
        state.sandboxId,
      );
    } catch (disconnectErr) {
      logger.warn(
        { sandboxId: state.sandboxId, error: disconnectErr, installSuccess },
        "Failed to disconnect container after install",
      );
    }

    if (!installSuccess) {
      return {
        step: WorkflowStep.INSTALL_PACKAGES,
        success: false,
        error:
          installError?.message || installResult.error || "Installation failed",
        durationMs: Date.now() - startTime,
        retryCount: 0,
      };
    }

    return {
      step: WorkflowStep.INSTALL_PACKAGES,
      success: true,
      data: {
        installed: packageSpecs.length,
        warnings: installResult.warnings,
      },
      durationMs: Date.now() - startTime,
      retryCount: 0,
    };
  } catch (error) {
    return {
      step: WorkflowStep.INSTALL_PACKAGES,
      success: false,
      error: error instanceof Error ? error.message : "Installation failed",
      durationMs: Date.now() - startTime,
      retryCount: 0,
    };
  }
}

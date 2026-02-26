import { nanoid } from "nanoid";
import { logger } from "../../../../utils/logger.js";
import type {
  Framework,
  IntentAnalysis,
  PackageInfo,
  StepResult,
  WorkflowContext,
  WorkflowState,
} from "../../schemas.js";
import {
  WorkflowStatus,
  WorkflowStep,
  type WorkflowStepType,
} from "../../schemas.js";
import { analyzeIntent } from "../../analyzers/intentAnalyzer.js";
import { resolvePackages } from "../../../registry/package.registry.js";
import { runValidationPipeline } from "../../../validation/pipeline.js";
import {
  provisionSandbox,
  getActiveSandbox,
} from "../../../sandbox/lifecycle/provisioning.js";
import {
  getSandboxState,
  getChatFramework,
} from "../../../sandbox/state.service.js";
import { hasBackup, hasBackupOnS3 } from "../../../sandbox/backup.service.js";
import { buildAndUploadUnified } from "../../../sandbox/builder/unified.build.js";
import { getDecryptedApiKey } from "../../../apiKey.service.js";
import { mergeAndInstallDependencies } from "../../../sandbox/templates/dependency.merger.js";
import { connectToNetwork } from "../../../sandbox/docker.service.js";
import { disconnectContainerFromNetwork } from "../../../sandbox/utils.service.js";
import { saveWorkflow } from "../store.js";
import { acquireLock, releaseLock } from "../locks.js";
import { formatPackageSpec } from "../../../packages/packageSpec.js";

export async function createWorkflow(
  userId: string,
  chatId: string,
  initialContext: Partial<WorkflowContext> = {},
): Promise<WorkflowState> {
  const state: WorkflowState = {
    id: nanoid(16),
    userId,
    chatId,
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

export async function ensureSandbox(
  state: WorkflowState,
  framework?: Framework,
  shouldRestore: boolean = false,
): Promise<string> {
  const callId = nanoid(8);
  logger.info(
    { workflowId: state.id, chatId: state.chatId, callId },
    "ensureSandbox called",
  );

  let sandboxId = await getActiveSandbox(state.chatId);

  if (sandboxId) {
    logger.info(
      { workflowId: state.id, sandboxId, callId },
      "ensureSandbox: Reused existing sandbox",
    );
    state.sandboxId = sandboxId;
    await saveWorkflow(state);
    return sandboxId;
  }

  let effectiveFramework = framework || state.context.framework;
  if (!effectiveFramework) {
    const cachedFramework = await getChatFramework(state.chatId);
    if (cachedFramework) {
      effectiveFramework = cachedFramework as Framework;
      logger.info(
        { chatId: state.chatId, framework: effectiveFramework },
        "Recovered framework from Redis cache for sandbox provisioning",
      );
    }
  }

  let effectiveRestore = false;
  if (shouldRestore) {
    effectiveRestore = await hasBackup(state.chatId);
    if (!effectiveRestore) {
      effectiveRestore = await hasBackupOnS3(state.chatId, state.userId);
      if (effectiveRestore) {
        logger.info(
          { chatId: state.chatId },
          "Backup flag missing in Redis but found on S3, restoring",
        );
      } else {
        logger.debug(
          { chatId: state.chatId },
          "shouldRestore requested but no backup exists, skipping restore",
        );
      }
    }
  }

  sandboxId = await provisionSandbox(
    state.userId,
    state.chatId,
    effectiveFramework,
    effectiveRestore,
  );

  logger.info(
    {
      workflowId: state.id,
      sandboxId,
      callId,
      framework: effectiveFramework,
      restored: effectiveRestore,
    },
    "ensureSandbox: New sandbox provisioned",
  );
  state.sandboxId = sandboxId;
  await saveWorkflow(state);
  return sandboxId;
}

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

export async function executeAnalyzePhase(
  state: WorkflowState,
  userRequest: string,
): Promise<StepResult> {
  const startTime = Date.now();

  try {
    const apiKey = await getDecryptedApiKey(state.userId);
    const analysis = await analyzeIntent(userRequest, apiKey);
    state.context.intent = analysis as IntentAnalysis;
    state.context.framework = (analysis as IntentAnalysis).suggestedFramework;

    return {
      step: WorkflowStep.ANALYZE,
      success: true,
      data: analysis,
      durationMs: Date.now() - startTime,
      retryCount: 0,
    };
  } catch (error) {
    return {
      step: WorkflowStep.ANALYZE,
      success: false,
      error: error instanceof Error ? error.message : "Analysis failed",
      durationMs: Date.now() - startTime,
      retryCount: 0,
    };
  }
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
        return await executePackageResolution(state, (input as string[]) || []);
      } finally {
        await releaseLock(`resolve:${state.id}`, lockId);
      }
    }

    case WorkflowStep.ANALYZE:
      return executeAnalyzePhase(state, (input as string) || "");

    case WorkflowStep.INSTALL_PACKAGES:
      return executeInstallPhase(state);

    case WorkflowStep.BUILD:
      return executeBuildPhase(state);

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

import type { Response } from "express";
import {
  executeInstallPhase,
  ensureSandbox,
} from "../../../../services/planning/workflow/steps.js";
import { addSandboxPackages } from "../../../../services/sandbox/lifecycle/packages.js";
import { getActiveSandbox } from "../../../../services/sandbox/lifecycle/provisioning.js";
import { normalizeFramework } from "../../../../services/sandbox/templates/template.registry.js";
import type { WorkflowState } from "../../../../services/planning/schemas.js";
import {
  resolveDependencies,
  suggestAlternatives,
} from "../../../../services/planning/resolvers/dependency.resolver.js";
import { formatPackageSpec } from "../../../../services/packages/packageSpec.js";
import { ensureError } from "../../../../utils/error.js";
import { logger } from "../../../../utils/logger.js";
import {
  sendSSERecoverableError,
} from "../../sse.utils.js";

export async function handleInstallContent(
  ctx: Pick<
    {
      workflow: WorkflowState;
      res: Response;
      chatId: string;
      isFollowUp: boolean;
      declaredPackages: string[];
      abortSignal?: AbortSignal;
    },
    "workflow" | "res" | "chatId" | "isFollowUp" | "declaredPackages" | "abortSignal"
  >,
  dependencies: string[] | undefined,
  framework: string | undefined,
): Promise<void> {
  if (ctx.abortSignal?.aborted) {
    return;
  }

  if (dependencies) {
    ctx.declaredPackages.push(...dependencies);
  }
  if (framework) {
    const normalized = normalizeFramework(framework);
    if (normalized) {
      ctx.workflow.context.framework = normalized;
    }
  }
  if (!ctx.workflow.sandboxId) {
    await ensureSandbox(
      ctx.workflow,
      ctx.workflow.context.framework,
      ctx.isFollowUp,
    );
  }

  if (!ctx.workflow.sandboxId) {
    logger.warn(
      { chatId: ctx.chatId },
      "INSTALL_CONTENT received without an active sandbox; skipping install",
    );
    return;
  }

  const rawDependencies = dependencies || [];
  if (rawDependencies.length === 0) return;
  if (ctx.abortSignal?.aborted) return;

  const frameworkForResolution = ctx.workflow.context.framework || "vanilla";
  const resolution = await resolveDependencies(
    rawDependencies,
    frameworkForResolution,
  );
  const validDeps = resolution.resolved.map((dep) =>
    formatPackageSpec(dep.name, dep.version),
  );

  if (resolution.failed.length > 0) {
    const failures = resolution.failed.map((dep) => dep.name).join(", ");
    const suggestions = resolution.failed
      .flatMap((dep) => suggestAlternatives(dep.name))
      .filter(Boolean);

    const message =
      `Invalid dependencies detected: ${failures}` +
      (suggestions.length > 0
        ? ` (suggested alternatives: ${Array.from(new Set(suggestions)).join(", ")})`
        : "");

    sendSSERecoverableError(ctx.res, message, {
      code: "invalid_dependencies",
      details: {
        failed: resolution.failed.map((dep) => dep.name),
      },
    });
  }

  if (validDeps.length === 0) {
    return;
  }

  ctx.workflow.context.resolvedPackages = resolution.resolved.map((dep) => ({
    name: dep.name,
    version: dep.version || "latest",
    valid: true,
    peerDependencies: dep.peerDependencies,
  }));
  if (ctx.workflow.sandboxId) {
    await addSandboxPackages(ctx.workflow.sandboxId, validDeps);
  }
  if (ctx.abortSignal?.aborted) return;

  const installResult = await executeInstallPhase(ctx.workflow);
  if (!installResult.success) {
    sendSSERecoverableError(
      ctx.res,
      installResult.error || "Dependency installation failed",
      {
        code: "dependency_install_failed",
        details: {
          dependencies: validDeps,
        },
      },
    );
    return;
  }
}

export async function resolveCommandSandboxId(
  ctx: Pick<
    {
      workflow: WorkflowState;
      chatId: string;
      isFollowUp: boolean;
    },
    "workflow" | "chatId" | "isFollowUp"
  >,
): Promise<string | undefined> {
  if (ctx.workflow.sandboxId) {
    try {
      const activeSandboxId = await getActiveSandbox(ctx.chatId);
      if (activeSandboxId) {
        ctx.workflow.sandboxId = activeSandboxId;
        return activeSandboxId;
      }
      logger.warn(
        {
          chatId: ctx.chatId,
          previousSandboxId: ctx.workflow.sandboxId,
        },
        "Command sandbox appears stale; attempting reprovision/restore",
      );
      ctx.workflow.sandboxId = undefined;
    } catch (sandboxLookupError) {
      logger.warn(
        {
          chatId: ctx.chatId,
          error: ensureError(sandboxLookupError),
        },
        "Failed to validate existing sandbox for command execution; falling back to existing id",
      );
      return ctx.workflow.sandboxId;
    }
  }

  try {
    const recoveredSandboxId = await getActiveSandbox(ctx.chatId);
    if (recoveredSandboxId) {
      ctx.workflow.sandboxId = recoveredSandboxId;
      return recoveredSandboxId;
    }
  } catch (sandboxLookupError) {
    logger.warn(
      {
        chatId: ctx.chatId,
        error: ensureError(sandboxLookupError),
      },
      "Failed to look up active sandbox for command execution; attempting provisioning fallback",
    );
  }

  try {
    const provisionedSandboxId = await ensureSandbox(
      ctx.workflow,
      ctx.workflow.context.framework,
      ctx.isFollowUp,
    );
    if (provisionedSandboxId) {
      ctx.workflow.sandboxId = provisionedSandboxId;
    }
    return provisionedSandboxId;
  } catch (sandboxLookupError) {
    logger.warn(
      {
        chatId: ctx.chatId,
        error: ensureError(sandboxLookupError),
      },
      "Failed to provision sandbox for command execution fallback",
    );
    return undefined;
  }
}

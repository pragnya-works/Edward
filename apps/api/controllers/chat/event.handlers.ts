import type { Response } from "express";
import {
  ParserEventType,
  type ParserEvent,
} from "../../schemas/chat.schema.js";
import {
  executeInstallPhase,
  ensureSandbox,
} from "../../services/planning/workflowEngine.js";
import { addSandboxPackages } from "../../services/sandbox/lifecycle/packages.js";
import {
  prepareSandboxFile,
  flushSandbox,
  sanitizeSandboxFile,
} from "../../services/sandbox/writes.sandbox.js";
import { normalizeFramework } from "../../services/sandbox/templates/template.registry.js";
import type { WorkflowState } from "../../services/planning/schemas.js";
import {
  resolveDependencies,
  suggestAlternatives,
} from "../../services/planning/resolvers/dependency.resolver.js";
import { ensureError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";
import { sendSSEError, sendSSEEvent } from "./sse.utils.js";
import { handleFileContent } from "./file.handlers.js";
import {
  executeCommandTool,
  executeWebSearchTool,
  type WebSearchToolResultItem as GatewayWebSearchResultItem,
} from "../../services/tools/toolGateway.service.js";
import type { AgentToolResult } from "./command.utils.js";
import type { WebSearchResultItem } from "@edward/shared/stream-events";

export interface EventHandlerContext {
  workflow: WorkflowState;
  res: Response;
  chatId: string;
  isFollowUp: boolean;
  sandboxTagDetected: boolean;
  currentFilePath: string | undefined;
  isFirstFileChunk: boolean;
  generatedFiles: Map<string, string>;
  declaredPackages: string[];
  toolResultsThisTurn: AgentToolResult[];
  runId?: string;
  turn?: number;
}

export interface EventHandlerResult {
  handled: boolean;
  currentFilePath: string | undefined;
  isFirstFileChunk: boolean;
  sandboxTagDetected: boolean;
}

async function handleSandboxStart(ctx: EventHandlerContext): Promise<void> {
  if (!ctx.workflow.sandboxId) {
    await ensureSandbox(ctx.workflow, undefined, ctx.isFollowUp);
  }
}

async function handleFileStart(
  ctx: EventHandlerContext,
  filePath: string,
): Promise<{ currentFilePath: string; isFirstFileChunk: boolean }> {
  if (!ctx.workflow.sandboxId || !ctx.sandboxTagDetected) {
    throw new Error("FILE_START received without an active sandbox session");
  }
  await prepareSandboxFile(ctx.workflow.sandboxId, filePath);
  return { currentFilePath: filePath, isFirstFileChunk: true };
}

async function handleFileContentEvent(
  ctx: EventHandlerContext,
  content: string,
): Promise<boolean> {
  if (!ctx.workflow.sandboxId || !ctx.currentFilePath) {
    return ctx.isFirstFileChunk;
  }

  await handleFileContent(
    ctx.workflow.sandboxId,
    ctx.currentFilePath,
    content,
    ctx.isFirstFileChunk,
  );
  ctx.generatedFiles.set(
    ctx.currentFilePath,
    (ctx.generatedFiles.get(ctx.currentFilePath) || "") + content,
  );
  return false;
}

async function handleSandboxEnd(ctx: EventHandlerContext): Promise<void> {
  if (ctx.workflow.sandboxId) {
    await flushSandbox(ctx.workflow.sandboxId).catch((err: unknown) =>
      logger.error(
        ensureError(err),
        `Flush failed during SANDBOX_END: ${ctx.workflow.sandboxId}`,
      ),
    );
  }
}

async function handleInstallContent(
  ctx: EventHandlerContext,
  dependencies: string[] | undefined,
  framework: string | undefined,
): Promise<void> {
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

  const frameworkForResolution = ctx.workflow.context.framework || "vanilla";
  const resolution = await resolveDependencies(
    rawDependencies,
    frameworkForResolution,
  );
  const validDeps = resolution.resolved.map((dep) => dep.name);

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

    sendSSEError(ctx.res, message, {
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

  const installResult = await executeInstallPhase(ctx.workflow);
  if (!installResult.success) {
    sendSSEError(
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

async function handleCommand(
  ctx: EventHandlerContext,
  command: string,
  args: string[],
): Promise<void> {
  if (!ctx.sandboxTagDetected || !ctx.workflow.sandboxId) {
    sendSSEError(
      ctx.res,
      "Command skipped: no active sandbox session. Emit <edward_sandbox> first.",
      { code: "command_without_sandbox" },
    );
    return;
  }

  try {
    const result = await executeCommandTool({
      runId: ctx.runId,
      turn: ctx.turn ?? 1,
      sandboxId: ctx.workflow.sandboxId,
      command,
      args,
    });
    const stdout = result.stdout;
    const stderr = result.stderr;

    ctx.toolResultsThisTurn.push({
      tool: "command",
      command,
      args,
      stdout,
      stderr,
    });

    sendSSEEvent(ctx.res, {
      type: ParserEventType.COMMAND,
      command,
      args,
      exitCode: result.exitCode,
      stdout,
      stderr,
    });
  } catch (cmdError) {
    const err = ensureError(cmdError);
    ctx.toolResultsThisTurn.push({
      tool: "command",
      command,
      args,
      stdout: "",
      stderr: `Command failed: ${err.message}`,
    });
    sendSSEError(ctx.res, `Command failed: ${err.message}`, {
      code: "command_failed",
      details: { command, args },
    });
  }
}

async function handleWebSearch(
  ctx: EventHandlerContext,
  query: string,
  maxResults?: number,
): Promise<void> {
  try {
    const requestedMax = Math.min(maxResults ?? 5, 8);
    const search = await executeWebSearchTool({
      runId: ctx.runId,
      turn: ctx.turn ?? 1,
      query,
      maxResults: requestedMax,
    });
    const normalizedResults: WebSearchResultItem[] =
      search.results.map((item: GatewayWebSearchResultItem) => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
      }));
    const normalizedAnswer = search.answer;

    ctx.toolResultsThisTurn.push({
      tool: "web_search",
      query: search.query,
      answer: normalizedAnswer,
      results: normalizedResults,
    });

    sendSSEEvent(ctx.res, {
      type: ParserEventType.WEB_SEARCH,
      query: search.query,
      maxResults: requestedMax,
      answer: normalizedAnswer,
      results: normalizedResults,
    });
  } catch (webSearchError) {
    const err = ensureError(webSearchError);
    ctx.toolResultsThisTurn.push({
      tool: "web_search",
      query,
      results: [],
      error: err.message,
    });
    sendSSEError(ctx.res, `Web search failed: ${err.message}`, {
      code: "web_search_failed",
      details: { query },
    });
  }
}

export async function handleParserEvent(
  ctx: EventHandlerContext,
  event: ParserEvent,
): Promise<EventHandlerResult> {
  let handled = false;
  let sandboxTagDetected = ctx.sandboxTagDetected;
  let { currentFilePath, isFirstFileChunk } = ctx;

  try {
    switch (event.type) {
      case ParserEventType.SANDBOX_START:
        sandboxTagDetected = true;
        ctx.sandboxTagDetected = true;
        await handleSandboxStart(ctx);
        break;

      case ParserEventType.FILE_START: {
        const result = await handleFileStart(ctx, event.path);
        currentFilePath = result.currentFilePath;
        isFirstFileChunk = result.isFirstFileChunk;
        break;
      }

      case ParserEventType.FILE_CONTENT:
        isFirstFileChunk = await handleFileContentEvent(ctx, event.content);
        break;

      case ParserEventType.FILE_END:
        if (ctx.workflow.sandboxId && currentFilePath) {
          await sanitizeSandboxFile(ctx.workflow.sandboxId, currentFilePath);
        }
        currentFilePath = undefined;
        break;

      case ParserEventType.SANDBOX_END:
        await handleSandboxEnd(ctx);
        break;

      case ParserEventType.INSTALL_CONTENT:
        sendSSEEvent(ctx.res, event);
        await handleInstallContent(ctx, event.dependencies, event.framework);
        handled = true;
        break;

      case ParserEventType.COMMAND:
        await handleCommand(ctx, event.command, event.args ?? []);
        handled = true;
        break;

      case ParserEventType.WEB_SEARCH:
        await handleWebSearch(ctx, event.query, event.maxResults);
        handled = true;
        break;
    }
  } catch (sandboxError) {
    logger.error(
      ensureError(sandboxError),
      "Sandbox operation failed during streaming",
    );
    sendSSEError(ctx.res, "Sandbox execution failed", {
      code: "sandbox_execution_failed",
    });
  }

  return { handled, currentFilePath, isFirstFileChunk, sandboxTagDetected };
}

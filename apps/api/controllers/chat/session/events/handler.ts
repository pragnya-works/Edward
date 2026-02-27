import type { Response } from "express";
import {
  ParserEventType,
  type ParserEvent,
} from "../../../../schemas/chat.schema.js";
import {
  ensureSandbox,
} from "../../../../services/planning/workflow/steps.js";
import {
  prepareSandboxFile,
  sanitizeSandboxFile,
} from "../../../../services/sandbox/write/buffer.js";
import { flushSandbox } from "../../../../services/sandbox/write/flush.js";
import type { WorkflowState } from "../../../../services/planning/schemas.js";
import { ensureError } from "../../../../utils/error.js";
import { logger } from "../../../../utils/logger.js";
import {
  sendSSEError,
  sendSSEEvent,
  sendSSERecoverableError,
} from "../../sse.utils.js";
import { handleFileContent } from "../../file.handlers.js";
import type { AgentToolResult } from "@edward/shared/streamToolResults";
import { handleCommandEvent } from "./tools/command.js";
import { handleWebSearchEvent } from "./tools/webSearch.js";
import {
  handleInstallContent,
  resolveCommandSandboxId,
} from "./handler.helpers.js";

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
  installTaskQueue?: {
    enqueue(task: () => Promise<void>): void;
    waitForIdle(): Promise<void>;
  };
  abortSignal?: AbortSignal;
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
  ctx.generatedFiles.set(filePath, "");
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
        {
          const runInstall = async () => {
            if (ctx.abortSignal?.aborted) {
              return;
            }

            sendSSEEvent(ctx.res, {
              type: ParserEventType.INSTALL_CONTENT,
              dependencies: event.dependencies,
              framework: event.framework,
            });

            try {
              await handleInstallContent(
                {
                  workflow: ctx.workflow,
                  res: ctx.res,
                  chatId: ctx.chatId,
                  isFollowUp: ctx.isFollowUp,
                  declaredPackages: ctx.declaredPackages,
                  abortSignal: ctx.abortSignal,
                },
                event.dependencies,
                event.framework,
              );
            } catch (installError) {
              const err = ensureError(installError);
              logger.error(
                { err, chatId: ctx.chatId, dependencies: event.dependencies },
                "Install execution failed",
              );
              sendSSERecoverableError(
                ctx.res,
                `Dependency installation failed: ${err.message}`,
                {
                  code: "dependency_install_failed",
                  details: {
                    dependencies: event.dependencies,
                  },
                },
              );
            } finally {
              sendSSEEvent(ctx.res, {
                type: ParserEventType.INSTALL_END,
              });
            }
          };

          if (ctx.installTaskQueue) {
            ctx.installTaskQueue.enqueue(runInstall);
          } else {
            await runInstall();
          }
        }
        handled = true;
        break;

      case ParserEventType.INSTALL_END:
        handled = true;
        break;

      case ParserEventType.COMMAND:
        {
          await ctx.installTaskQueue?.waitForIdle();
          if (ctx.abortSignal?.aborted) {
            handled = true;
            break;
          }

          const sandboxId = await resolveCommandSandboxId(ctx);
          await handleCommandEvent(
            {
              res: ctx.res,
              sandboxId,
              recoverSandboxId: async () => {
                ctx.workflow.sandboxId = undefined;
                return resolveCommandSandboxId(ctx);
              },
              runId: ctx.runId,
              turn: ctx.turn,
              installTaskQueue: ctx.installTaskQueue,
              abortSignal: ctx.abortSignal,
              toolResultsThisTurn: ctx.toolResultsThisTurn,
            },
            event.command,
            event.args ?? [],
          );
        }
        handled = true;
        break;

      case ParserEventType.WEB_SEARCH:
        await handleWebSearchEvent(
          {
            res: ctx.res,
            runId: ctx.runId,
            turn: ctx.turn,
            toolResultsThisTurn: ctx.toolResultsThisTurn,
          },
          event.query,
          event.maxResults,
        );
        handled = true;
        break;
    }
  } catch (sandboxError) {
    handled = true;
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

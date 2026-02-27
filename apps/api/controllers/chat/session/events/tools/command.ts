import type { Response } from "express";
import { ParserEventType } from "../../../../../schemas/chat.schema.js";
import { ensureError } from "../../../../../utils/error.js";
import {
  sendSSEEvent,
  sendSSERecoverableError,
} from "../../../sse.utils.js";
import {
  executeCommandTool,
} from "../../../../../services/tools/toolGateway.service.js";
import type { AgentToolResult } from "@edward/shared/streamToolResults";

interface CommandEventContext {
  res: Response;
  sandboxId: string | undefined;
  recoverSandboxId?: () => Promise<string | undefined>;
  runId?: string;
  turn?: number;
  installTaskQueue?: {
    waitForIdle(): Promise<void>;
  };
  abortSignal?: AbortSignal;
  toolResultsThisTurn: AgentToolResult[];
}

function isRetryableSandboxCommandError(message: string): boolean {
  const retryablePatterns = [
    /\bsandbox not found\b/i,
    /\bsandbox state not found\b/i,
    /\bno such container\b/i,
    /\bcontainer not found\b/i,
  ];
  return retryablePatterns.some((pattern) => pattern.test(message));
}

export async function handleCommandEvent(
  ctx: CommandEventContext,
  command: string,
  args: string[],
): Promise<void> {
  const sandboxId = ctx.sandboxId;

  if (!sandboxId) {
    const message =
      "Command skipped: no active sandbox session. Emit <edward_sandbox> first.";
    ctx.toolResultsThisTurn.push({
      tool: "command",
      command,
      args,
      stdout: "",
      stderr: message,
    });
    sendSSEEvent(ctx.res, {
      type: ParserEventType.COMMAND,
      command,
      args,
      exitCode: 1,
      stdout: "",
      stderr: message,
    });
    sendSSERecoverableError(ctx.res, message, {
      code: "command_without_sandbox",
      details: { command, args },
    });
    return;
  }

  await ctx.installTaskQueue?.waitForIdle();
  if (ctx.abortSignal?.aborted) {
    return;
  }

  try {
    const result = await executeCommandTool({
      runId: ctx.runId,
      turn: ctx.turn ?? 1,
      sandboxId,
      command,
      args,
    });

    ctx.toolResultsThisTurn.push({
      tool: "command",
      command,
      args,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    sendSSEEvent(ctx.res, {
      type: ParserEventType.COMMAND,
      command,
      args,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (cmdError) {
    const initialError = ensureError(cmdError);

    if (ctx.recoverSandboxId && isRetryableSandboxCommandError(initialError.message)) {
      try {
        const recoveredSandboxId = await ctx.recoverSandboxId();
        if (recoveredSandboxId) {
          const retriedResult = await executeCommandTool({
            runId: ctx.runId,
            turn: ctx.turn ?? 1,
            sandboxId: recoveredSandboxId,
            command,
            args,
          });

          ctx.toolResultsThisTurn.push({
            tool: "command",
            command,
            args,
            stdout: retriedResult.stdout,
            stderr: retriedResult.stderr,
          });

          sendSSEEvent(ctx.res, {
            type: ParserEventType.COMMAND,
            command,
            args,
            exitCode: retriedResult.exitCode,
            stdout: retriedResult.stdout,
            stderr: retriedResult.stderr,
          });
          return;
        }
      } catch (retryError) {
        const retryErr = ensureError(retryError);
        ctx.toolResultsThisTurn.push({
          tool: "command",
          command,
          args,
          stdout: "",
          stderr: `Command failed: ${initialError.message} | retry failed: ${retryErr.message}`,
        });
        sendSSEEvent(ctx.res, {
          type: ParserEventType.COMMAND,
          command,
          args,
          exitCode: 1,
          stdout: "",
          stderr: `Command failed: ${initialError.message} | retry failed: ${retryErr.message}`,
        });
        sendSSERecoverableError(
          ctx.res,
          `Command failed: ${initialError.message} | retry failed: ${retryErr.message}`,
          {
            code: "command_failed",
            details: { command, args },
          },
        );
        return;
      }
    }

    ctx.toolResultsThisTurn.push({
      tool: "command",
      command,
      args,
      stdout: "",
      stderr: `Command failed: ${initialError.message}`,
    });
    sendSSEEvent(ctx.res, {
      type: ParserEventType.COMMAND,
      command,
      args,
      exitCode: 1,
      stdout: "",
      stderr: `Command failed: ${initialError.message}`,
    });
    sendSSERecoverableError(ctx.res, `Command failed: ${initialError.message}`, {
      code: "command_failed",
      details: { command, args },
    });
  }
}

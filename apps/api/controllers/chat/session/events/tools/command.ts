import type { Response } from "express";
import { ParserEventType } from "../../../../../schemas/chat.schema.js";
import { ensureError } from "../../../../../utils/error.js";
import { sendSSEError, sendSSEEvent } from "../../../sse.utils.js";
import {
  executeCommandTool,
} from "../../../../../services/tools/toolGateway.service.js";
import type { AgentToolResult } from "@edward/shared/streamToolResults";

interface CommandEventContext {
  res: Response;
  sandboxTagDetected: boolean;
  sandboxId: string | undefined;
  runId?: string;
  turn?: number;
  installTaskQueue?: {
    waitForIdle(): Promise<void>;
  };
  abortSignal?: AbortSignal;
  toolResultsThisTurn: AgentToolResult[];
}

export async function handleCommandEvent(
  ctx: CommandEventContext,
  command: string,
  args: string[],
): Promise<void> {
  if (!ctx.sandboxTagDetected || !ctx.sandboxId) {
    sendSSEError(
      ctx.res,
      "Command skipped: no active sandbox session. Emit <edward_sandbox> first.",
      { code: "command_without_sandbox" },
    );
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
      sandboxId: ctx.sandboxId,
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

import type { Response } from "express";
import { ParserEventType } from "../../schemas/chat.schema.js";
import type { WorkflowState } from "../../services/planning/schemas.js";
import { safeSSEWrite } from "./sse.utils.js";
import { formatToolResults, type AgentToolResult } from "./command.utils.js";
import type { EventHandlerContext } from "./event.handlers.js";

export enum AgentLoopStopReason {
  DONE = "done",
  NO_TOOL_RESULTS = "no_tool_results",
  MAX_TURNS_REACHED = "max_turns_reached",
  TOOL_BUDGET_EXCEEDED = "tool_budget_exceeded",
}

interface StreamMetaBase {
  chatId: string;
  userMessageId: string;
  assistantMessageId: string;
  isNewChat: boolean;
  runId: string;
}

export type EmitMeta = (payload: Record<string, unknown>) => boolean;

export function createMetaEmitter(
  res: Response,
  base: StreamMetaBase,
): EmitMeta {
  return (payload: Record<string, unknown>) =>
    safeSSEWrite(
      res,
      `data: ${JSON.stringify({
        type: ParserEventType.META,
        ...base,
        ...payload,
      })}\n\n`,
    );
}

export function emitTurnCompleteMeta(
  emitMeta: EmitMeta,
  turn: number,
  toolCount: number,
): void {
  emitMeta({
    turn,
    phase: "turn_complete",
    toolCount,
  });
}

export interface EventHandlerContextParams {
  workflow: WorkflowState;
  res: Response;
  decryptedApiKey: string;
  userId: string;
  chatId: string;
  isFollowUp: boolean;
  sandboxTagDetected: boolean;
  currentFilePath: string | undefined;
  isFirstFileChunk: boolean;
  generatedFiles: Map<string, string>;
  declaredPackages: string[];
  toolResultsThisTurn: AgentToolResult[];
}

export function buildEventHandlerContext(
  params: EventHandlerContextParams,
): EventHandlerContext {
  return {
    workflow: params.workflow,
    res: params.res,
    decryptedApiKey: params.decryptedApiKey,
    userId: params.userId,
    chatId: params.chatId,
    isFollowUp: params.isFollowUp,
    sandboxTagDetected: params.sandboxTagDetected,
    currentFilePath: params.currentFilePath,
    isFirstFileChunk: params.isFirstFileChunk,
    generatedFiles: params.generatedFiles,
    declaredPackages: params.declaredPackages,
    toolResultsThisTurn: params.toolResultsThisTurn,
  };
}

export function buildAgentContinuationPrompt(
  fullUserContent: string,
  turnRawResponse: string,
  toolResults: AgentToolResult[],
): string {
  const formattedResults = formatToolResults(toolResults);

  const prevSummary =
    turnRawResponse.length > 4000
      ? turnRawResponse.slice(0, 4000) + "\n...[truncated]"
      : turnRawResponse;

  return `ORIGINAL REQUEST:\n${fullUserContent}\n\nYOUR PREVIOUS RESPONSE:\n${prevSummary}\n\nTOOL RESULTS:\n${formattedResults}\n\nContinue with the task. If you wrote fixes, verify by running the build. If you need more information, use <edward_command> or <edward_web_search>. Do not stop until you have completed the request and emitted <edward_done />.`;
}

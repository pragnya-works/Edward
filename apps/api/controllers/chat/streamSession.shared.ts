import type { Response } from "express";
import {
  MetaPhase,
  ParserEventType,
  type MetaEvent,
} from "@edward/shared/stream-events";
import type { WorkflowState } from "../../services/planning/schemas.js";
import {
  MAX_AGENT_CONTINUATION_PROMPT_CHARS,
} from "../../utils/sharedConstants.js";
import { sendSSEEvent } from "./sse.utils.js";
import { formatToolResults, type AgentToolResult } from "./command.utils.js";
import type { EventHandlerContext } from "./event.handlers.js";

interface StreamMetaBase {
  chatId: string;
  userMessageId: string;
  assistantMessageId: string;
  isNewChat: boolean;
  runId: string;
}

export type EmitMeta = (
  payload: Omit<MetaEvent, "type" | "version" | keyof StreamMetaBase>,
) => boolean;

export function createMetaEmitter(
  res: Response,
  base: StreamMetaBase,
): EmitMeta {
  return (
    payload: Omit<MetaEvent, "type" | "version" | keyof StreamMetaBase>,
  ) =>
    sendSSEEvent(res, {
      type: ParserEventType.META,
      ...base,
      ...payload,
    });
}

export function emitTurnCompleteMeta(
  emitMeta: EmitMeta,
  turn: number,
  toolCount: number,
): void {
  emitMeta({
    turn,
    phase: MetaPhase.TURN_COMPLETE,
    toolCount,
  });
}

export interface EventHandlerContextParams {
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
  turn: number;
}

export function buildEventHandlerContext(
  params: EventHandlerContextParams,
): EventHandlerContext {
  return {
    workflow: params.workflow,
    res: params.res,
    chatId: params.chatId,
    isFollowUp: params.isFollowUp,
    sandboxTagDetected: params.sandboxTagDetected,
    currentFilePath: params.currentFilePath,
    isFirstFileChunk: params.isFirstFileChunk,
    generatedFiles: params.generatedFiles,
    declaredPackages: params.declaredPackages,
    toolResultsThisTurn: params.toolResultsThisTurn,
    runId: params.runId,
    turn: params.turn,
  };
}

function truncateWithMarker(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }
  return `${input.slice(0, maxChars)}\n...[truncated]`;
}

export function buildAgentContinuationPrompt(
  fullUserContent: string,
  turnRawResponse: string,
  toolResults: AgentToolResult[],
): { prompt: string; truncated: boolean } {
  const userContent = truncateWithMarker(fullUserContent, 7_000);
  const previousResponse = truncateWithMarker(turnRawResponse, 7_000);
  const formattedResults = truncateWithMarker(
    formatToolResults(toolResults),
    10_000,
  );

  const prompt = `ORIGINAL REQUEST:\n${userContent}\n\nYOUR PREVIOUS RESPONSE:\n${previousResponse}\n\nTOOL RESULTS:\n${formattedResults}\n\nContinue with the task. If you wrote fixes, verify by running the build. If you need more information, use <edward_command> or <edward_web_search>. Do not stop until you have completed the request and emitted <edward_done />.`;

  if (prompt.length <= MAX_AGENT_CONTINUATION_PROMPT_CHARS) {
    return { prompt, truncated: false };
  }

  return {
    prompt: truncateWithMarker(prompt, MAX_AGENT_CONTINUATION_PROMPT_CHARS),
    truncated: true,
  };
}

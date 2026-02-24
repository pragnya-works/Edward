import type { Response } from "express";
import {
  MetaPhase,
  ParserEventType,
  type MetaEvent,
} from "@edward/shared/streamEvents";
import type { WorkflowState } from "../../../../services/planning/schemas.js";
import { sendSSEEvent } from "../../sse.utils.js";
import type { EventHandlerContext } from "../events/handler.js";
import type { AgentToolResult } from "@edward/shared/streamToolResults";

interface InstallTaskQueue {
  enqueue(task: () => Promise<void>): void;
  waitForIdle(): Promise<void>;
}

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
  installTaskQueue: InstallTaskQueue;
  abortSignal: AbortSignal;
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
    installTaskQueue: params.installTaskQueue,
    abortSignal: params.abortSignal,
  };
}

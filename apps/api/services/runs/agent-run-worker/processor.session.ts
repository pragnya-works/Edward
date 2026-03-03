import { EventEmitter } from "node:events";
import type { Response } from "express";
import { updateRun } from "@edward/auth";
import type { AuthenticatedRequest } from "../../../middleware/auth.js";
import type { LlmChatMessage } from "../../../lib/llm/context.js";
import type { AgentRunMetadata, RunResumeCheckpoint } from "../runMetadata.js";

interface SessionRunRecord {
  userId: string;
  chatId: string;
  userMessageId: string;
  assistantMessageId: string;
}

interface BuildWorkerRunSessionInputParams {
  req: AuthenticatedRequest;
  res: Response;
  externalSignal: AbortSignal;
  workflow: AgentRunMetadata["workflow"];
  run: SessionRunRecord;
  decryptedApiKey: string;
  getMetadata: () => AgentRunMetadata;
  historyMessages: LlmChatMessage[];
  projectContext: string;
  runId: string;
  onMetadataUpdated: (metadata: AgentRunMetadata) => void;
  onTurnUpdated: (turn: number) => void;
}

interface WorkerCheckpoint {
  turn: number;
  fullRawResponse: string;
  agentMessages: LlmChatMessage[];
  sandboxTagDetected: boolean;
  totalToolCallsInRun: number;
  updatedAt: number;
}

export function createWorkerRequest(userId: string): AuthenticatedRequest {
  return Object.assign(new EventEmitter(), {
    userId,
    sessionId: undefined,
  }) as unknown as AuthenticatedRequest;
}

export function buildWorkerRunSessionInput(
  params: BuildWorkerRunSessionInputParams,
) {
  const {
    req,
    res,
    externalSignal,
    workflow,
    run,
    decryptedApiKey,
    getMetadata,
    historyMessages,
    projectContext,
    runId,
    onMetadataUpdated,
    onTurnUpdated,
  } = params;
  const metadata = getMetadata();

  return {
    req,
    res,
    externalSignal,
    workflow,
    userId: run.userId,
    chatId: run.chatId,
    decryptedApiKey,
    userContent: metadata.userContent,
    userTextContent: metadata.userTextContent,
    userMessageId: run.userMessageId,
    assistantMessageId: run.assistantMessageId,
    preVerifiedDeps: metadata.preVerifiedDeps,
    isFollowUp: metadata.isFollowUp,
    intent: metadata.intent,
    historyMessages,
    projectContext,
    model: metadata.model,
    runId,
    resumeCheckpoint: metadata.resumeCheckpoint
      ? {
        turn: metadata.resumeCheckpoint.turn,
        fullRawResponse: metadata.resumeCheckpoint.fullRawResponse,
        agentMessages: metadata.resumeCheckpoint.agentMessages,
        sandboxTagDetected: metadata.resumeCheckpoint.sandboxTagDetected,
        totalToolCallsInRun: metadata.resumeCheckpoint.totalToolCallsInRun,
      }
      : undefined,
    onCheckpoint: async (checkpoint: WorkerCheckpoint) => {
      const currentMetadata = getMetadata();
      const mergedMetadata: AgentRunMetadata = {
        ...currentMetadata,
        resumeCheckpoint: {
          turn: checkpoint.turn,
          fullRawResponse: checkpoint.fullRawResponse,
          agentMessages: checkpoint.agentMessages,
          sandboxTagDetected: checkpoint.sandboxTagDetected,
          totalToolCallsInRun: checkpoint.totalToolCallsInRun,
          updatedAt: checkpoint.updatedAt,
        } satisfies RunResumeCheckpoint,
      };
      onMetadataUpdated(mergedMetadata);
      onTurnUpdated(checkpoint.turn);
      await updateRun(runId, {
        currentTurn: checkpoint.turn,
        metadata: mergedMetadata as unknown as Record<string, unknown>,
      });
    },
  };
}

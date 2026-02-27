import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../../middleware/auth.js";
import type { WorkflowState, ChatAction as ChatActionType } from "../../../../services/planning/schemas.js";
import type { LlmChatMessage } from "../../../../lib/llm/context.js";
import type { MessageContent } from "@edward/shared/llm/types";

export interface StreamSessionParams {
  req: AuthenticatedRequest;
  res: Response;
  externalSignal?: AbortSignal;
  workflow: WorkflowState;
  userId: string;
  chatId: string;
  decryptedApiKey: string;
  userContent: MessageContent;
  userTextContent: string;
  userMessageId: string;
  assistantMessageId: string;
  preVerifiedDeps: string[];
  isFollowUp?: boolean;
  intent?: ChatActionType;
  historyMessages?: LlmChatMessage[];
  projectContext?: string;
  model?: string;
  runId?: string;
  resumeCheckpoint?: {
    turn: number;
    fullRawResponse: string;
    agentMessages: LlmChatMessage[];
    sandboxTagDetected: boolean;
    totalToolCallsInRun: number;
  };
  onCheckpoint?: (checkpoint: {
    turn: number;
    fullRawResponse: string;
    agentMessages: LlmChatMessage[];
    sandboxTagDetected: boolean;
    totalToolCallsInRun: number;
    updatedAt: number;
  }) => Promise<void>;
}

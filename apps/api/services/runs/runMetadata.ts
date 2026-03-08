import { ChatActionSchema, WorkflowStateSchema } from "../planning/schemas.js";
import type { ChatAction, WorkflowState } from "../planning/schemas.js";
import type { LlmChatMessage } from "../../lib/llm/context.js";
import type { MessageContent } from "@edward/shared/llm/types";

export const AGENT_RUN_METADATA_VERSION = "agent_run_v1";

export interface RunResumeCheckpoint {
  turn: number;
  fullRawResponse: string;
  agentMessages: LlmChatMessage[];
  sandboxTagDetected: boolean;
  totalToolCallsInRun: number;
  outputTokens?: number;
  updatedAt: number;
}

export interface AgentRunMetadata {
  version: typeof AGENT_RUN_METADATA_VERSION;
  workflow: WorkflowState;
  userContent: MessageContent;
  userTextContent: string;
  preVerifiedDeps: string[];
  isFollowUp: boolean;
  intent: ChatAction;
  historyMessages?: LlmChatMessage[];
  projectContext?: string;
  model?: string;
  traceId?: string;
  resumeCheckpoint?: RunResumeCheckpoint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createAgentRunMetadata(
  input: Omit<AgentRunMetadata, "version">,
): AgentRunMetadata {
  return {
    version: AGENT_RUN_METADATA_VERSION,
    ...input,
  };
}

export function parseAgentRunMetadata(input: unknown): AgentRunMetadata {
  if (!isRecord(input)) {
    throw new Error("Run metadata is missing");
  }

  if (input.version !== AGENT_RUN_METADATA_VERSION) {
    throw new Error(`Unsupported run metadata version: ${String(input.version)}`);
  }

  const workflow = WorkflowStateSchema.parse(input.workflow);

  if (typeof input.userTextContent !== "string") {
    throw new Error("Run metadata userTextContent is invalid");
  }

  const preVerifiedDepsRaw = input.preVerifiedDeps;
  if (
    !Array.isArray(preVerifiedDepsRaw) ||
    !preVerifiedDepsRaw.every((dep) => typeof dep === "string")
  ) {
    throw new Error("Run metadata preVerifiedDeps is invalid");
  }

  if (typeof input.isFollowUp !== "boolean") {
    throw new Error("Run metadata isFollowUp is invalid");
  }

  const intent = ChatActionSchema.parse(input.intent);

  const userContent = input.userContent as MessageContent;
  const historyMessagesRaw = input.historyMessages;
  const historyMessages = Array.isArray(historyMessagesRaw)
    ? (historyMessagesRaw as LlmChatMessage[])
    : undefined;
  const projectContext =
    typeof input.projectContext === "string"
      ? input.projectContext
      : undefined;

  return {
    version: AGENT_RUN_METADATA_VERSION,
    workflow,
    userContent,
    userTextContent: input.userTextContent,
    preVerifiedDeps: preVerifiedDepsRaw,
    isFollowUp: input.isFollowUp,
    intent,
    historyMessages,
    projectContext,
    model: typeof input.model === "string" ? input.model : undefined,
    traceId: typeof input.traceId === "string" ? input.traceId : undefined,
    resumeCheckpoint: isRecord(input.resumeCheckpoint) &&
      typeof input.resumeCheckpoint.fullRawResponse === "string" &&
      typeof input.resumeCheckpoint.turn === "number" &&
      Array.isArray(input.resumeCheckpoint.agentMessages) &&
      typeof input.resumeCheckpoint.sandboxTagDetected === "boolean" &&
      typeof input.resumeCheckpoint.updatedAt === "number"
      ? {
          turn: input.resumeCheckpoint.turn,
          fullRawResponse: input.resumeCheckpoint.fullRawResponse,
          agentMessages: input.resumeCheckpoint.agentMessages as LlmChatMessage[],
          sandboxTagDetected: input.resumeCheckpoint.sandboxTagDetected,
          totalToolCallsInRun:
            typeof input.resumeCheckpoint.totalToolCallsInRun === "number"
              ? input.resumeCheckpoint.totalToolCallsInRun
              : 0,
          outputTokens:
            Number.isFinite(input.resumeCheckpoint.outputTokens) &&
            (input.resumeCheckpoint.outputTokens as number) >= 0
              ? (input.resumeCheckpoint.outputTokens as number)
              : undefined,
          updatedAt: input.resumeCheckpoint.updatedAt,
        }
      : undefined,
  };
}

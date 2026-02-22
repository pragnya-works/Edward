import { ChatActionSchema, WorkflowStateSchema } from "../planning/schemas.js";
import type { ChatAction, WorkflowState } from "../planning/schemas.js";
import type { LlmChatMessage } from "../../lib/llm/context.js";
import type { MessageContent } from "../../lib/llm/types.js";

export const AGENT_RUN_METADATA_VERSION = "agent_run_v1";

export interface RunResumeCheckpoint {
  turn: number;
  fullRawResponse: string;
  agentMessages: LlmChatMessage[];
  sandboxTagDetected: boolean;
  totalToolCallsInRun: number;
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
  historyMessages: LlmChatMessage[];
  projectContext: string;
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

  const historyMessagesRaw = input.historyMessages;
  if (!Array.isArray(historyMessagesRaw)) {
    throw new Error("Run metadata historyMessages is invalid");
  }

  if (typeof input.projectContext !== "string") {
    throw new Error("Run metadata projectContext is invalid");
  }

  const userContent = input.userContent as MessageContent;
  const historyMessages = historyMessagesRaw as LlmChatMessage[];

  return {
    version: AGENT_RUN_METADATA_VERSION,
    workflow,
    userContent,
    userTextContent: input.userTextContent,
    preVerifiedDeps: preVerifiedDepsRaw,
    isFollowUp: input.isFollowUp,
    intent,
    historyMessages,
    projectContext: input.projectContext,
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
          updatedAt: input.resumeCheckpoint.updatedAt,
        }
      : undefined,
  };
}

import type { LlmChatMessage } from "../../../../lib/llm/context.js";

export interface AgentLoopCheckpoint {
  turn: number;
  fullRawResponse: string;
  agentMessages: LlmChatMessage[];
  sandboxTagDetected: boolean;
  totalToolCallsInRun: number;
}

export type AgentLoopCheckpointWriter = (
  checkpoint: AgentLoopCheckpoint & { updatedAt: number },
) => Promise<void>;

import {
  AgentLoopStopReason,
  StreamTerminationReason,
} from "@edward/shared/streamEvents";

export const LOOP_STOP_REASON_TO_TERMINATION: Record<
  AgentLoopStopReason,
  StreamTerminationReason
> = {
  [AgentLoopStopReason.DONE]: StreamTerminationReason.COMPLETED,
  [AgentLoopStopReason.NO_TOOL_RESULTS]: StreamTerminationReason.COMPLETED,
  [AgentLoopStopReason.MAX_TURNS_REACHED]: StreamTerminationReason.COMPLETED,
  [AgentLoopStopReason.CONTEXT_LIMIT_EXCEEDED]:
    StreamTerminationReason.CONTEXT_LIMIT_EXCEEDED,
  [AgentLoopStopReason.TOOL_BUDGET_EXCEEDED]:
    StreamTerminationReason.TOOL_BUDGET_EXCEEDED,
  [AgentLoopStopReason.RUN_TOOL_BUDGET_EXCEEDED]:
    StreamTerminationReason.RUN_TOOL_BUDGET_EXCEEDED,
  [AgentLoopStopReason.TOOL_PAYLOAD_BUDGET_EXCEEDED]:
    StreamTerminationReason.TOOL_PAYLOAD_BUDGET_EXCEEDED,
  [AgentLoopStopReason.CONTINUATION_BUDGET_EXCEEDED]:
    StreamTerminationReason.CONTINUATION_BUDGET_EXCEEDED,
  [AgentLoopStopReason.RESPONSE_SIZE_EXCEEDED]:
    StreamTerminationReason.RESPONSE_SIZE_EXCEEDED,
};

export const LOOP_STOP_REASON_TO_ERROR_HINT: Record<
  AgentLoopStopReason,
  string
> = {
  [AgentLoopStopReason.DONE]:
    "The stream ended before any assistant output was produced.",
  [AgentLoopStopReason.NO_TOOL_RESULTS]:
    "The assistant did not produce output for this request.",
  [AgentLoopStopReason.MAX_TURNS_REACHED]:
    "The assistant reached the maximum number of reasoning turns.",
  [AgentLoopStopReason.TOOL_BUDGET_EXCEEDED]:
    "The assistant hit the per-turn tool budget limit.",
  [AgentLoopStopReason.RUN_TOOL_BUDGET_EXCEEDED]:
    "The assistant hit the run-level tool budget limit.",
  [AgentLoopStopReason.CONTEXT_LIMIT_EXCEEDED]:
    "The prompt exceeded the model context window.",
  [AgentLoopStopReason.TOOL_PAYLOAD_BUDGET_EXCEEDED]:
    "Tool payloads exceeded the per-turn budget.",
  [AgentLoopStopReason.CONTINUATION_BUDGET_EXCEEDED]:
    "Continuation context exceeded allowed limits.",
  [AgentLoopStopReason.RESPONSE_SIZE_EXCEEDED]:
    "The response exceeded the maximum stream size limit.",
};

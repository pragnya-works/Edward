import {
  MAX_AGENT_TOOL_CALLS_PER_RUN,
  MAX_AGENT_TOOL_CALLS_PER_TURN,
  MAX_AGENT_TOOL_RESULT_PAYLOAD_CHARS,
} from "../../../../utils/constants.js";
import type { AgentToolResult } from "@edward/shared/streamToolResults";

export interface TurnBudgetState {
  toolBudgetExceededThisTurn: boolean;
  toolRunBudgetExceededThisTurn: boolean;
  toolPayloadExceededThisTurn: boolean;
}

export function createTurnBudgetState(): TurnBudgetState {
  return {
    toolBudgetExceededThisTurn: false,
    toolRunBudgetExceededThisTurn: false,
    toolPayloadExceededThisTurn: false,
  };
}

function getToolResultsPayloadChars(results: AgentToolResult[]): number {
  return JSON.stringify(results).length;
}

export function hasAnyTurnBudgetExceeded(state: TurnBudgetState): boolean {
  return (
    state.toolBudgetExceededThisTurn ||
    state.toolRunBudgetExceededThisTurn ||
    state.toolPayloadExceededThisTurn
  );
}

export function updateToolBudgetState(
  state: TurnBudgetState,
  toolResultsThisTurn: AgentToolResult[],
  totalToolCallsInRun: number,
): void {
  if (toolResultsThisTurn.length >= MAX_AGENT_TOOL_CALLS_PER_TURN) {
    state.toolBudgetExceededThisTurn = true;
    return;
  }

  if (totalToolCallsInRun >= MAX_AGENT_TOOL_CALLS_PER_RUN) {
    state.toolRunBudgetExceededThisTurn = true;
    return;
  }

  if (
    getToolResultsPayloadChars(toolResultsThisTurn) >
    MAX_AGENT_TOOL_RESULT_PAYLOAD_CHARS
  ) {
    state.toolPayloadExceededThisTurn = true;
  }
}

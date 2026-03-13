import {
  MAX_AGENT_TOOL_CALLS_PER_RUN,
  MAX_AGENT_TOOL_CALLS_PER_TURN,
} from "../../../../utils/constants.js";
import type { AgentToolResult } from "@edward/shared/streamToolResults";

export interface TurnBudgetState {
  toolBudgetExceededThisTurn: boolean;
  toolRunBudgetExceededThisTurn: boolean;
}

export function createTurnBudgetState(): TurnBudgetState {
  return {
    toolBudgetExceededThisTurn: false,
    toolRunBudgetExceededThisTurn: false,
  };
}

export function hasAnyTurnBudgetExceeded(state: TurnBudgetState): boolean {
  return state.toolBudgetExceededThisTurn || state.toolRunBudgetExceededThisTurn;
}

export function updateToolBudgetState(
  state: TurnBudgetState,
  toolResultsThisTurn: AgentToolResult[],
  totalToolCallsInRun: number,
): void {
  if (toolResultsThisTurn.length > MAX_AGENT_TOOL_CALLS_PER_TURN) {
    state.toolBudgetExceededThisTurn = true;
    return;
  }

  if (totalToolCallsInRun > MAX_AGENT_TOOL_CALLS_PER_RUN) {
    state.toolRunBudgetExceededThisTurn = true;
  }
}

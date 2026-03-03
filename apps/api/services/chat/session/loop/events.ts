import {
  type ParserEvent,
} from "../../../../schemas/chat.schema.js";
import {
  ParserEventType,
} from "@edward/shared/streamEvents";
import { handleParserEvent } from "../events/handler.js";
import type { AgentToolResult } from "@edward/shared/streamToolResults";
import {
  buildEventHandlerContext,
  type EventHandlerContextParams,
} from "../shared/meta.js";
import { sendSSEEvent } from "../../../../services/sse-utils/service.js";
import {
  hasAnyTurnBudgetExceeded,
  type TurnBudgetState,
  updateToolBudgetState,
} from "./budgets.js";

export interface TurnEventState {
  doneTagDetectedThisTurn: boolean;
  codeOutputDetectedThisTurn: boolean;
  currentFilePath: string | undefined;
  isFirstFileChunk: boolean;
  sandboxTagDetected: boolean;
  totalToolCallsInRun: number;
}

export function createTurnEventState(
  initialSandboxTagDetected: boolean,
  initialTotalToolCallsInRun: number,
): TurnEventState {
  return {
    doneTagDetectedThisTurn: false,
    codeOutputDetectedThisTurn: false,
    currentFilePath: undefined,
    isFirstFileChunk: true,
    sandboxTagDetected: initialSandboxTagDetected,
    totalToolCallsInRun: initialTotalToolCallsInRun,
  };
}

interface ProcessParserEventsParams {
  events: ParserEvent[];
  turnState: TurnEventState;
  budgetState: TurnBudgetState;
  toolResultsThisTurn: AgentToolResult[];
  context: Omit<
    EventHandlerContextParams,
    "currentFilePath" | "isFirstFileChunk" | "sandboxTagDetected"
  >;
}

export async function processParserEvents(
  params: ProcessParserEventsParams,
): Promise<void> {
  const {
    events,
    turnState,
    budgetState,
    toolResultsThisTurn,
    context,
  } = params;

  if (hasAnyTurnBudgetExceeded(budgetState)) {
    return;
  }

  for (const event of events) {
    if (event.type === ParserEventType.DONE) {
      turnState.doneTagDetectedThisTurn = true;
      continue;
    }

    const toolCountBefore = toolResultsThisTurn.length;

    const eventContext = buildEventHandlerContext({
      ...context,
      currentFilePath: turnState.currentFilePath,
      isFirstFileChunk: turnState.isFirstFileChunk,
      sandboxTagDetected: turnState.sandboxTagDetected,
    });

    const result = await handleParserEvent(eventContext, event);
    turnState.currentFilePath = result.currentFilePath;
    turnState.isFirstFileChunk = result.isFirstFileChunk;
    turnState.sandboxTagDetected = result.sandboxTagDetected;

    if (
      event.type === ParserEventType.FILE_START &&
      result.currentFilePath === event.path &&
      result.isFirstFileChunk
    ) {
      turnState.codeOutputDetectedThisTurn = true;
    }

    if (!result.handled) {
      sendSSEEvent(context.res, event);
    }

    const toolCountAfter = toolResultsThisTurn.length;
    if (toolCountAfter > toolCountBefore) {
      turnState.totalToolCallsInRun += toolCountAfter - toolCountBefore;
    }

    updateToolBudgetState(
      budgetState,
      toolResultsThisTurn,
      turnState.totalToolCallsInRun,
    );
    if (hasAnyTurnBudgetExceeded(budgetState)) {
      return;
    }
  }
}

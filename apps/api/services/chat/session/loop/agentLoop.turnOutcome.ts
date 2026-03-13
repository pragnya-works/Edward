import { MessageRole } from "@edward/auth";
import { AgentLoopStopReason } from "@edward/shared/streamEvents";
import type { MessageContent } from "@edward/shared/llm/types";
import type { AgentToolResult } from "@edward/shared/streamToolResults";
import {
  MAX_AGENT_CONTINUATION_PROMPT_CHARS,
  MAX_AGENT_TOOL_CALLS_PER_RUN,
  MAX_AGENT_TOOL_CALLS_PER_TURN,
  MAX_AGENT_TURNS,
} from "../../../../utils/constants.js";
import { logger } from "../../../../utils/logger.js";
import type { LlmChatMessage } from "../../../../lib/llm/context.js";
import { getTextFromContent } from "../../../../lib/llm/types.js";
import { sendSSEError, sendSSERecoverableError } from "../../../../services/sse-utils/service.js";
import { buildAgentContinuationPrompt } from "../shared/continuation.js";
import { emitTurnCompleteMeta, type EmitMeta, type EventHandlerContextParams } from "../shared/meta.js";
import type { AgentLoopCheckpointWriter } from "../shared/checkpoint.types.js";
import { type createTurnBudgetState } from "./budgets.js";
import { type createTurnEventState } from "./events.js";

const EDWARD_TAG_PATTERN = /<edward_/i;
const THINKING_TAG_PATTERN = /<Thinking>/i;
const MAX_NO_PROGRESS_CONTINUATIONS = 1;
const MIN_CONVERSATIONAL_RESPONSE_LENGTH = 20;

function sendContinuationTruncationWarning(res: EventHandlerContextParams["res"], turn: number): void {
  sendSSERecoverableError(res, `Continuation context was compacted to stay within ${MAX_AGENT_CONTINUATION_PROMPT_CHARS} characters`, {
    code: "continuation_prompt_truncated",
    details: { limitChars: MAX_AGENT_CONTINUATION_PROMPT_CHARS, turn },
  });
}

async function checkpointContinuationMessages(params: {
  onCheckpoint?: AgentLoopCheckpointWriter;
  turn: number;
  fullRawResponse: string;
  prompt: string;
  sandboxTagDetected: boolean;
  totalToolCallsInRun: number;
  outputTokens?: number;
}): Promise<LlmChatMessage[]> {
  const agentMessages: LlmChatMessage[] = [{
    role: MessageRole.User,
    content: params.prompt,
  }];
  await params.onCheckpoint?.({
    turn: params.turn,
    fullRawResponse: params.fullRawResponse,
    agentMessages,
    sandboxTagDetected: params.sandboxTagDetected,
    totalToolCallsInRun: params.totalToolCallsInRun,
    outputTokens: params.outputTokens,
    updatedAt: Date.now(),
  });
  return agentMessages;
}

function trimForContinuationPrefix(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }
  return input.slice(0, maxChars);
}

function buildNoProgressContinuationPrompt(params: {
  fullUserContent: string;
  turnRawResponse: string;
  attempt: number;
}): { prompt: string; truncated: boolean } {
  const base = buildAgentContinuationPrompt(
    params.fullUserContent,
    params.turnRawResponse,
    [],
  );
  const directive = `\n\nNo actionable tool/file output was produced in the previous turn (attempt ${params.attempt}/${MAX_NO_PROGRESS_CONTINUATIONS}). Continue execution now:
- To inspect/debug project state, emit one or more <edward_command ...> tags.
- To gather external info, emit <edward_web_search ...>.
- To implement changes, emit <edward_sandbox> with complete <file> blocks, then <edward_done />.
Do not stop at narration-only output.`;
  const availableForBase = Math.max(
    0,
    MAX_AGENT_CONTINUATION_PROMPT_CHARS - directive.length,
  );
  const prompt = `${trimForContinuationPrefix(base.prompt, availableForBase)}${directive}`;
  const truncated = base.truncated || base.prompt.length > availableForBase;
  return { prompt, truncated };
}

export interface ResolveTurnOutcomeParams {
  agentTurn: number;
  turnRawResponse: string;
  userContent: MessageContent;
  res: EventHandlerContextParams["res"];
  emitMeta: EmitMeta;
  budgetState: ReturnType<typeof createTurnBudgetState>;
  turnState: ReturnType<typeof createTurnEventState>;
  toolResultsThisTurn: AgentToolResult[];
  totalToolCallsInRun: number;
  fullRawResponse: string;
  sandboxTagDetected: boolean;
  chatId: string;
  runId: string;
  onCheckpoint?: AgentLoopCheckpointWriter;
  agentMessages: LlmChatMessage[];
  abortSignal: AbortSignal;
  noProgressContinuations: number;
  outputTokens?: number;
}

export interface ResolveTurnOutcomeResult {
  action: "break" | "continue";
  loopStopReason: AgentLoopStopReason;
  agentMessages: LlmChatMessage[];
  noProgressContinuations: number;
}

export async function resolveTurnOutcome(
  params: ResolveTurnOutcomeParams,
): Promise<ResolveTurnOutcomeResult> {
  const codeOutputDetected = params.turnState.codeOutputDetectedThisTurn;

  if (params.budgetState.toolBudgetExceededThisTurn) {
    sendSSEError(
      params.res,
      `Turn reached maximum tool calls (${MAX_AGENT_TOOL_CALLS_PER_TURN})`,
      {
        code: "tool_budget_exceeded",
        details: {
          limit: MAX_AGENT_TOOL_CALLS_PER_TURN,
          turnCount: params.toolResultsThisTurn.length,
          turn: params.agentTurn,
        },
      },
    );
    emitTurnCompleteMeta(params.emitMeta, params.agentTurn, params.toolResultsThisTurn.length);
    return {
      action: "break",
      loopStopReason: AgentLoopStopReason.TOOL_BUDGET_EXCEEDED,
      agentMessages: params.agentMessages,
      noProgressContinuations: params.noProgressContinuations,
    };
  }

  if (params.budgetState.toolRunBudgetExceededThisTurn) {
    sendSSEError(
      params.res,
      `Run reached maximum tool calls (${MAX_AGENT_TOOL_CALLS_PER_RUN})`,
      {
        code: "run_tool_budget_exceeded",
        details: {
          limit: MAX_AGENT_TOOL_CALLS_PER_RUN,
          runCount: params.totalToolCallsInRun,
          turn: params.agentTurn,
        },
      },
    );
    emitTurnCompleteMeta(params.emitMeta, params.agentTurn, params.toolResultsThisTurn.length);
    return {
      action: "break",
      loopStopReason: AgentLoopStopReason.RUN_TOOL_BUDGET_EXCEEDED,
      agentMessages: params.agentMessages,
      noProgressContinuations: params.noProgressContinuations,
    };
  }

  if (codeOutputDetected) {
    emitTurnCompleteMeta(params.emitMeta, params.agentTurn, params.toolResultsThisTurn.length);
    return {
      action: "break",
      loopStopReason: AgentLoopStopReason.DONE,
      agentMessages: params.agentMessages,
      noProgressContinuations: params.noProgressContinuations,
    };
  }

  if (
    params.toolResultsThisTurn.length > 0 &&
    !codeOutputDetected &&
    !params.abortSignal.aborted
  ) {
    if (params.agentTurn >= MAX_AGENT_TURNS) {
      emitTurnCompleteMeta(params.emitMeta, params.agentTurn, params.toolResultsThisTurn.length);
      return {
        action: "break",
        loopStopReason: AgentLoopStopReason.MAX_TURNS_REACHED,
        agentMessages: params.agentMessages,
        noProgressContinuations: params.noProgressContinuations,
      };
    }

    const userTextContent =
      typeof params.userContent === "string"
        ? params.userContent
        : getTextFromContent(params.userContent);
    const continuationResult = buildAgentContinuationPrompt(
      userTextContent,
      params.turnRawResponse,
      params.toolResultsThisTurn,
    );
    if (continuationResult.truncated) {
      sendContinuationTruncationWarning(params.res, params.agentTurn);
    }

    const agentMessages = await checkpointContinuationMessages({
      onCheckpoint: params.onCheckpoint,
      turn: params.agentTurn,
      fullRawResponse: params.fullRawResponse,
      prompt: continuationResult.prompt,
      sandboxTagDetected: params.sandboxTagDetected,
      totalToolCallsInRun: params.totalToolCallsInRun,
      outputTokens: params.outputTokens,
    });
    logger.info(
      {
        chatId: params.chatId,
        runId: params.runId,
        turn: params.agentTurn,
        toolCount: params.toolResultsThisTurn.length,
        doneTagDetectedThisTurn: params.turnState.doneTagDetectedThisTurn,
      },
      "Agent loop: continuing with tool results",
    );
    emitTurnCompleteMeta(params.emitMeta, params.agentTurn, params.toolResultsThisTurn.length);
    return {
      action: "continue",
      loopStopReason: AgentLoopStopReason.NO_TOOL_RESULTS,
      agentMessages,
      noProgressContinuations: 0,
    };
  }

  if (params.turnState.doneTagDetectedThisTurn) {
    emitTurnCompleteMeta(params.emitMeta, params.agentTurn, params.toolResultsThisTurn.length);
    return {
      action: "break",
      loopStopReason: AgentLoopStopReason.DONE,
      agentMessages: params.agentMessages,
      noProgressContinuations: params.noProgressContinuations,
    };
  }

  const isConversationalReply =
    params.turnRawResponse.trim().length >= MIN_CONVERSATIONAL_RESPONSE_LENGTH &&
    !EDWARD_TAG_PATTERN.test(params.turnRawResponse) &&
    !THINKING_TAG_PATTERN.test(params.turnRawResponse);
  if (isConversationalReply) {
    emitTurnCompleteMeta(params.emitMeta, params.agentTurn, 0);
    return {
      action: "break",
      loopStopReason: AgentLoopStopReason.DONE,
      agentMessages: params.agentMessages,
      noProgressContinuations: params.noProgressContinuations,
    };
  }

  if (
    params.toolResultsThisTurn.length === 0 &&
    !codeOutputDetected &&
    !params.turnState.doneTagDetectedThisTurn &&
    !params.abortSignal.aborted &&
    params.agentTurn < MAX_AGENT_TURNS &&
    params.noProgressContinuations < MAX_NO_PROGRESS_CONTINUATIONS
  ) {
    const noProgressContinuations = params.noProgressContinuations + 1;
    const userTextContent =
      typeof params.userContent === "string"
        ? params.userContent
        : getTextFromContent(params.userContent);
    const continuationResult = buildNoProgressContinuationPrompt({
      fullUserContent: userTextContent,
      turnRawResponse: params.turnRawResponse,
      attempt: noProgressContinuations,
    });
    if (continuationResult.truncated) {
      sendContinuationTruncationWarning(params.res, params.agentTurn);
    }

    const agentMessages = await checkpointContinuationMessages({
      onCheckpoint: params.onCheckpoint,
      turn: params.agentTurn,
      fullRawResponse: params.fullRawResponse,
      prompt: continuationResult.prompt,
      sandboxTagDetected: params.sandboxTagDetected,
      totalToolCallsInRun: params.totalToolCallsInRun,
      outputTokens: params.outputTokens,
    });
    logger.warn(
      {
        chatId: params.chatId,
        runId: params.runId,
        turn: params.agentTurn,
        attempt: noProgressContinuations,
      },
      "Agent loop: no actionable output detected; issuing continuation nudge",
    );
    emitTurnCompleteMeta(params.emitMeta, params.agentTurn, 0);
    return {
      action: "continue",
      loopStopReason: AgentLoopStopReason.NO_TOOL_RESULTS,
      agentMessages,
      noProgressContinuations,
    };
  }

  emitTurnCompleteMeta(params.emitMeta, params.agentTurn, params.toolResultsThisTurn.length);
  const reachedMaxTurns = params.agentTurn >= MAX_AGENT_TURNS;
  return {
    action: "break",
    loopStopReason: reachedMaxTurns
      ? AgentLoopStopReason.MAX_TURNS_REACHED
      : AgentLoopStopReason.NO_TOOL_RESULTS,
    agentMessages: params.agentMessages,
    noProgressContinuations: params.noProgressContinuations,
  };
}

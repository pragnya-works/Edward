import { MessageRole } from "@edward/auth";
import {
  AgentLoopStopReason,
  MetaPhase,
  ParserEventType,
} from "@edward/shared/stream-events";
import { createStreamParser } from "../../lib/llm/parser.js";
import { streamResponse } from "../../lib/llm/response.js";
import {
  computeTokenUsage,
  isOverContextLimit,
} from "../../lib/llm/tokens.js";
import {
  MAX_AGENT_CONTINUATION_PROMPT_CHARS,
  MAX_AGENT_TOOL_CALLS_PER_TURN,
  MAX_AGENT_TOOL_CALLS_PER_RUN,
  MAX_AGENT_TOOL_RESULT_PAYLOAD_CHARS,
  MAX_AGENT_TURNS,
  MAX_RESPONSE_SIZE,
} from "../../utils/sharedConstants.js";
import { logger } from "../../utils/logger.js";
import type { LlmChatMessage } from "../../lib/llm/context.js";
import {
  getTextFromContent,
  type MessageContent,
} from "../../lib/llm/types.js";
import type { ChatAction, Framework } from "../../services/planning/schemas.js";
import { handleParserEvent } from "./event.handlers.js";
import type { AgentToolResult } from "./command.utils.js";
import {
  buildAgentContinuationPrompt,
  buildEventHandlerContext,
  emitTurnCompleteMeta,
  type EmitMeta,
} from "./streamSession.shared.js";
import { sendSSEError, sendSSEEvent } from "./sse.utils.js";

export interface RunAgentLoopParams {
  decryptedApiKey: string;
  initialMessages: LlmChatMessage[];
  preVerifiedDeps: string[];
  systemPrompt: string;
  framework: Framework | undefined;
  complexity: "simple" | "moderate" | "complex";
  mode: ChatAction;
  model: string | undefined;
  abortController: AbortController;
  userContent: MessageContent;
  workflow: RunAgentLoopContext["workflow"];
  res: RunAgentLoopContext["res"];
  chatId: string;
  isFollowUp: boolean;
  generatedFiles: Map<string, string>;
  declaredPackages: string[];
  emitMeta: EmitMeta;
  runId: string;
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

type RunAgentLoopContext = Parameters<typeof buildEventHandlerContext>[0];

export interface RunAgentLoopResult {
  fullRawResponse: string;
  agentTurn: number;
  loopStopReason: AgentLoopStopReason;
  aborted: boolean;
}

function getToolResultsPayloadChars(results: AgentToolResult[]): number {
  return JSON.stringify(results).length;
}

export async function runAgentLoop(
  params: RunAgentLoopParams,
): Promise<RunAgentLoopResult> {
  const {
    decryptedApiKey,
    initialMessages,
    preVerifiedDeps,
    systemPrompt,
    framework,
    complexity,
    mode,
    model,
    abortController,
    userContent,
    workflow,
    res,
    chatId,
    isFollowUp,
    generatedFiles,
    declaredPackages,
    emitMeta,
    runId,
    resumeCheckpoint,
    onCheckpoint,
  } = params;

  let fullRawResponse = resumeCheckpoint?.fullRawResponse ?? "";
  let agentMessages: LlmChatMessage[] =
    resumeCheckpoint?.agentMessages ?? initialMessages;
  let agentTurn = resumeCheckpoint?.turn ?? 0;
  let totalToolCallsInRun = resumeCheckpoint?.totalToolCallsInRun ?? 0;
  let sandboxTagDetected = resumeCheckpoint?.sandboxTagDetected ?? false;
  let loopStopReason: AgentLoopStopReason = AgentLoopStopReason.NO_TOOL_RESULTS;

  agentLoop: while (agentTurn < MAX_AGENT_TURNS) {
    agentTurn++;

    const turnTokenUsage = await computeTokenUsage({
      apiKey: decryptedApiKey,
      systemPrompt,
      messages: agentMessages,
      model,
    });

    emitMeta({
      turn: agentTurn,
      phase: MetaPhase.TURN_START,
      tokenUsage: turnTokenUsage,
    });

    if (isOverContextLimit(turnTokenUsage)) {
      loopStopReason = AgentLoopStopReason.CONTEXT_LIMIT_EXCEEDED;
      sendSSEError(
        res,
        `Turn context too large for model window. Input tokens=${turnTokenUsage.inputTokens}, reservedOutputTokens=${turnTokenUsage.reservedOutputTokens}, contextWindowTokens=${turnTokenUsage.contextWindowTokens}.`,
        {
          code: "context_limit_exceeded",
          details: {
            turn: agentTurn,
            inputTokens: turnTokenUsage.inputTokens,
            reservedOutputTokens: turnTokenUsage.reservedOutputTokens,
            contextWindowTokens: turnTokenUsage.contextWindowTokens,
          },
        },
      );
      emitTurnCompleteMeta(emitMeta, agentTurn, 0);
      break;
    }

    const parser = createStreamParser();
    const toolResultsThisTurn: AgentToolResult[] = [];
    let turnRawResponse = "";
    let doneTagDetectedThisTurn = false;
    let toolBudgetExceededThisTurn = false;
    let toolPayloadExceededThisTurn = false;
    let responseSizeExceededThisTurn = false;
    let currentFilePath: string | undefined;
    let isFirstFileChunk = true;

    const processEvents = async (events: ReturnType<typeof parser.process>) => {
      for (const event of events) {
        if (event.type === ParserEventType.DONE) {
          doneTagDetectedThisTurn = true;
          continue;
        }

        const toolCountBefore = toolResultsThisTurn.length;
        const ctx = buildEventHandlerContext({
          workflow,
          res,
          chatId,
          isFollowUp,
          sandboxTagDetected,
          currentFilePath,
          isFirstFileChunk,
          generatedFiles,
          declaredPackages,
          toolResultsThisTurn,
          runId,
          turn: agentTurn,
        });

        const result = await handleParserEvent(ctx, event);
        currentFilePath = result.currentFilePath;
        isFirstFileChunk = result.isFirstFileChunk;
        sandboxTagDetected = result.sandboxTagDetected;

        if (!result.handled) {
          sendSSEEvent(res, event);
        }

        const toolCountAfter = toolResultsThisTurn.length;
        if (toolCountAfter > toolCountBefore) {
          totalToolCallsInRun += toolCountAfter - toolCountBefore;
        }

        if (toolResultsThisTurn.length >= MAX_AGENT_TOOL_CALLS_PER_TURN) {
          toolBudgetExceededThisTurn = true;
          return;
        }

        if (totalToolCallsInRun >= MAX_AGENT_TOOL_CALLS_PER_RUN) {
          toolBudgetExceededThisTurn = true;
          return;
        }

        if (
          getToolResultsPayloadChars(toolResultsThisTurn) >
          MAX_AGENT_TOOL_RESULT_PAYLOAD_CHARS
        ) {
          toolPayloadExceededThisTurn = true;
          return;
        }
      }
    };

    const stream = streamResponse(
      decryptedApiKey,
      agentMessages,
      abortController.signal,
      preVerifiedDeps,
      systemPrompt,
      framework,
      complexity,
      mode,
      model,
    );

    for await (const chunk of stream) {
      if (abortController.signal.aborted) break;

      if (fullRawResponse.length + chunk.length > MAX_RESPONSE_SIZE) {
        responseSizeExceededThisTurn = true;
        break;
      }

      fullRawResponse += chunk;
      turnRawResponse += chunk;

      await processEvents(parser.process(chunk));

      if (toolBudgetExceededThisTurn || toolPayloadExceededThisTurn) {
        break;
      }
    }

    if (abortController.signal.aborted) {
      return {
        fullRawResponse,
        agentTurn,
        loopStopReason,
        aborted: true,
      };
    }

    await processEvents(parser.flush());

    if (responseSizeExceededThisTurn) {
      loopStopReason = AgentLoopStopReason.RESPONSE_SIZE_EXCEEDED;
      sendSSEError(res, "Response exceeded maximum size limit", {
        code: "response_size_exceeded",
        details: { maxBytes: MAX_RESPONSE_SIZE, turn: agentTurn },
      });
      emitTurnCompleteMeta(emitMeta, agentTurn, toolResultsThisTurn.length);
      break;
    }

    if (toolBudgetExceededThisTurn) {
      loopStopReason = AgentLoopStopReason.TOOL_BUDGET_EXCEEDED;
      sendSSEError(
        res,
        `Turn reached maximum tool calls (${MAX_AGENT_TOOL_CALLS_PER_TURN})`,
        {
          code: "tool_budget_exceeded",
          details: {
            limit: MAX_AGENT_TOOL_CALLS_PER_TURN,
            runLimit: MAX_AGENT_TOOL_CALLS_PER_RUN,
            runCount: totalToolCallsInRun,
            turn: agentTurn,
          },
        },
      );
      emitTurnCompleteMeta(emitMeta, agentTurn, toolResultsThisTurn.length);
      break;
    }

    if (toolPayloadExceededThisTurn) {
      loopStopReason = AgentLoopStopReason.TOOL_PAYLOAD_BUDGET_EXCEEDED;
      sendSSEError(
        res,
        `Tool result payload exceeded per-turn limit (${MAX_AGENT_TOOL_RESULT_PAYLOAD_CHARS} chars)`,
        {
          code: "tool_payload_budget_exceeded",
          details: {
            limitChars: MAX_AGENT_TOOL_RESULT_PAYLOAD_CHARS,
            turn: agentTurn,
          },
        },
      );
      emitTurnCompleteMeta(emitMeta, agentTurn, toolResultsThisTurn.length);
      break;
    }

    if (doneTagDetectedThisTurn) {
      emitTurnCompleteMeta(emitMeta, agentTurn, toolResultsThisTurn.length);
      loopStopReason = AgentLoopStopReason.DONE;
      break;
    }

    if (
      toolResultsThisTurn.length > 0 &&
      agentTurn < MAX_AGENT_TURNS &&
      !abortController.signal.aborted
    ) {
      const userTextContent =
        typeof userContent === "string"
          ? userContent
          : getTextFromContent(userContent);
      const continuationResult = buildAgentContinuationPrompt(
        userTextContent,
        turnRawResponse,
        toolResultsThisTurn,
      );
      if (continuationResult.truncated) {
        loopStopReason = AgentLoopStopReason.CONTINUATION_BUDGET_EXCEEDED;
        sendSSEError(
          res,
          `Continuation prompt exceeded limit (${MAX_AGENT_CONTINUATION_PROMPT_CHARS} chars)`,
          {
            code: "continuation_budget_exceeded",
            details: {
              limitChars: MAX_AGENT_CONTINUATION_PROMPT_CHARS,
              turn: agentTurn,
            },
          },
        );
        emitTurnCompleteMeta(emitMeta, agentTurn, toolResultsThisTurn.length);
        break;
      }

      agentMessages = [
        { role: MessageRole.User, content: continuationResult.prompt },
      ];
      await onCheckpoint?.({
        turn: agentTurn,
        fullRawResponse,
        agentMessages,
        sandboxTagDetected,
        totalToolCallsInRun,
        updatedAt: Date.now(),
      });
      logger.info(
        {
          chatId,
          runId,
          turn: agentTurn,
          toolCount: toolResultsThisTurn.length,
        },
        "Agent loop: continuing with tool results",
      );
      emitTurnCompleteMeta(emitMeta, agentTurn, toolResultsThisTurn.length);
      continue agentLoop;
    }

    emitTurnCompleteMeta(emitMeta, agentTurn, toolResultsThisTurn.length);

    if (toolResultsThisTurn.length === 0) {
      loopStopReason = AgentLoopStopReason.NO_TOOL_RESULTS;
    } else if (agentTurn >= MAX_AGENT_TURNS) {
      loopStopReason = AgentLoopStopReason.MAX_TURNS_REACHED;
    }

    break;
  }

  if (
    agentTurn >= MAX_AGENT_TURNS &&
    loopStopReason === AgentLoopStopReason.NO_TOOL_RESULTS
  ) {
    loopStopReason = AgentLoopStopReason.MAX_TURNS_REACHED;
  }

  return {
    fullRawResponse,
    agentTurn,
    loopStopReason,
    aborted: false,
  };
}

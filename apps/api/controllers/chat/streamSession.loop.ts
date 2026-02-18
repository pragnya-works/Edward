import { MessageRole } from "@edward/auth";
import { createStreamParser } from "../../lib/llm/parser.js";
import { streamResponse } from "../../lib/llm/response.js";
import { ParserEventType } from "../../schemas/chat.schema.js";
import {
  MAX_AGENT_TOOL_CALLS_PER_TURN,
  MAX_AGENT_TURNS,
  MAX_RESPONSE_SIZE,
} from "../../utils/sharedConstants.js";
import { logger } from "../../utils/logger.js";
import type { LlmChatMessage } from "../../lib/llm/context.js";
import { getTextFromContent, type MessageContent } from "../../lib/llm/types.js";
import type {
  ChatAction,
  Framework,
} from "../../services/planning/schemas.js";
import { handleFlushEvents, handleParserEvent } from "./event.handlers.js";
import type { AgentToolResult } from "./command.utils.js";
import {
  AgentLoopStopReason,
  buildAgentContinuationPrompt,
  buildEventHandlerContext,
  emitTurnCompleteMeta,
  type EmitMeta,
} from "./streamSession.shared.js";
import { safeSSEWrite } from "./sse.utils.js";

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
  userId: string;
  chatId: string;
  isFollowUp: boolean;
  generatedFiles: Map<string, string>;
  declaredPackages: string[];
  emitMeta: EmitMeta;
  runId: string;
}

type RunAgentLoopContext = Parameters<typeof buildEventHandlerContext>[0];

export interface RunAgentLoopResult {
  fullRawResponse: string;
  agentTurn: number;
  loopStopReason: AgentLoopStopReason;
  aborted: boolean;
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
    userId,
    chatId,
    isFollowUp,
    generatedFiles,
    declaredPackages,
    emitMeta,
    runId,
  } = params;

  let fullRawResponse = "";
  let agentMessages: LlmChatMessage[] = initialMessages;
  let agentTurn = 0;
  let sandboxTagDetected = false;
  let loopStopReason: AgentLoopStopReason = AgentLoopStopReason.NO_TOOL_RESULTS;

  agentLoop: while (agentTurn < MAX_AGENT_TURNS) {
    agentTurn++;
    emitMeta({ turn: agentTurn, phase: "turn_start" });

    const parser = createStreamParser();
    const toolResultsThisTurn: AgentToolResult[] = [];
    let turnRawResponse = "";
    let doneTagDetectedThisTurn = false;
    let toolBudgetExceededThisTurn = false;
    let currentFilePath: string | undefined;
    let isFirstFileChunk = true;

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
        throw new Error("Response size exceeded maximum limit");
      }
      fullRawResponse += chunk;
      turnRawResponse += chunk;

      const events = parser.process(chunk);
      for (const event of events) {
        if (event.type === ParserEventType.DONE) {
          doneTagDetectedThisTurn = true;
          continue;
        }

        const ctx = buildEventHandlerContext({
          workflow,
          res,
          decryptedApiKey,
          userId,
          chatId,
          isFollowUp,
          sandboxTagDetected,
          currentFilePath,
          isFirstFileChunk,
          generatedFiles,
          declaredPackages,
          toolResultsThisTurn,
        });

        const result = await handleParserEvent(ctx, event);
        currentFilePath = result.currentFilePath;
        isFirstFileChunk = result.isFirstFileChunk;
        sandboxTagDetected = result.sandboxTagDetected;

        if (!result.handled) {
          safeSSEWrite(res, `data: ${JSON.stringify(event)}\n\n`);
        }

        if (toolResultsThisTurn.length > MAX_AGENT_TOOL_CALLS_PER_TURN) {
          toolBudgetExceededThisTurn = true;
          break;
        }
      }

      if (toolBudgetExceededThisTurn) {
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

    const flushCtx = buildEventHandlerContext({
      workflow,
      res,
      decryptedApiKey,
      userId,
      chatId,
      isFollowUp,
      sandboxTagDetected,
      currentFilePath,
      isFirstFileChunk,
      generatedFiles,
      declaredPackages,
      toolResultsThisTurn,
    });

    const flushEvents = parser.flush();
    doneTagDetectedThisTurn =
      doneTagDetectedThisTurn ||
      flushEvents.some((event) => event.type === ParserEventType.DONE);

    const flushResult = await handleFlushEvents(
      flushCtx,
      flushEvents.filter((event) => event.type !== ParserEventType.DONE),
    );

    currentFilePath = flushResult.currentFilePath;
    isFirstFileChunk = flushResult.isFirstFileChunk;
    sandboxTagDetected = flushResult.sandboxTagDetected;

    if (toolBudgetExceededThisTurn) {
      loopStopReason = AgentLoopStopReason.TOOL_BUDGET_EXCEEDED;
      safeSSEWrite(
        res,
        `data: ${JSON.stringify({
          type: ParserEventType.ERROR,
          message: `Turn exceeded maximum tool calls (${MAX_AGENT_TOOL_CALLS_PER_TURN})`,
        })}\n\n`,
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
      const continuation = buildAgentContinuationPrompt(
        userTextContent,
        turnRawResponse,
        toolResultsThisTurn,
      );
      agentMessages = [{ role: MessageRole.User, content: continuation }];
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
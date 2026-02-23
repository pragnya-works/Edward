import { MessageRole } from "@edward/auth";
import {
  AgentLoopStopReason,
  MetaPhase,
} from "@edward/shared/streamEvents";
import { createStreamParser } from "../../../../../lib/llm/parser.js";
import { streamResponse } from "../../../../../lib/llm/provider.client.js";
import {
  computeTokenUsage,
  isOverContextLimit,
} from "../../../../../lib/llm/tokens.js";
import {
  MAX_AGENT_CONTINUATION_PROMPT_CHARS,
  MAX_AGENT_TOOL_CALLS_PER_RUN,
  MAX_AGENT_TOOL_CALLS_PER_TURN,
  MAX_AGENT_TOOL_RESULT_PAYLOAD_CHARS,
  MAX_AGENT_TURNS,
  MAX_RESPONSE_SIZE,
} from "../../../../../utils/constants.js";
import { logger } from "../../../../../utils/logger.js";
import type { LlmChatMessage } from "../../../../../lib/llm/context.js";
import {
  getTextFromContent,
} from "../../../../../lib/llm/types.js";
import type { MessageContent } from "@edward/shared/llm/types";
import type {
  ChatAction,
  Framework,
} from "../../../../../services/planning/schemas.js";
import type { AgentToolResult } from "@edward/shared/streamToolResults";
import { sendSSEError } from "../../../sse.utils.js";
import { buildAgentContinuationPrompt } from "../../shared/continuation.js";
import {
  emitTurnCompleteMeta,
  type EventHandlerContextParams,
  type EmitMeta,
} from "../../shared/meta.js";
import {
  createTurnBudgetState,
  hasAnyTurnBudgetExceeded,
} from "../budgets.js";
import {
  createTurnEventState,
  processParserEvents,
} from "../events.js";

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
  workflow: EventHandlerContextParams["workflow"];
  res: EventHandlerContextParams["res"];
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
  installTaskQueue?: {
    enqueue(task: () => Promise<void>): void;
    waitForIdle(): Promise<void>;
  };
}

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
    chatId,
    isFollowUp,
    generatedFiles,
    declaredPackages,
    emitMeta,
    runId,
    resumeCheckpoint,
    onCheckpoint,
    installTaskQueue: providedInstallTaskQueue,
  } = params;

  let installQueueTail = Promise.resolve();
  const installTaskQueue =
    providedInstallTaskQueue ??
    {
      enqueue(task: () => Promise<void>) {
        const queuedTask = installQueueTail.then(task, task);
        installQueueTail = queuedTask.catch(() => undefined);
      },
      async waitForIdle() {
        await installQueueTail;
      },
    };

  let fullRawResponse = resumeCheckpoint?.fullRawResponse ?? "";
  let agentMessages: LlmChatMessage[] =
    resumeCheckpoint?.agentMessages ?? initialMessages;
  let agentTurn = resumeCheckpoint?.turn ?? 0;
  let totalToolCallsInRun = resumeCheckpoint?.totalToolCallsInRun ?? 0;
  let sandboxTagDetected = resumeCheckpoint?.sandboxTagDetected ?? false;
  let loopStopReason: AgentLoopStopReason = AgentLoopStopReason.NO_TOOL_RESULTS;

  agentLoop: while (agentTurn < MAX_AGENT_TURNS) {
    agentTurn += 1;

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
        `Turn context too large for model window. Input tokens=${turnTokenUsage.totalContextTokens}, reservedOutputTokens=${turnTokenUsage.reservedOutputTokens}, contextWindowTokens=${turnTokenUsage.contextWindowTokens}.`,
        {
          code: "context_limit_exceeded",
          details: {
            turn: agentTurn,
            inputTokens: turnTokenUsage.totalContextTokens,
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
    const budgetState = createTurnBudgetState();
    const turnState = createTurnEventState(
      sandboxTagDetected,
      totalToolCallsInRun,
    );
    let turnRawResponse = "";
    let responseSizeExceededThisTurn = false;

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
      if (abortController.signal.aborted) {
        break;
      }

      if (fullRawResponse.length + chunk.length > MAX_RESPONSE_SIZE) {
        responseSizeExceededThisTurn = true;
        break;
      }

      fullRawResponse += chunk;
      turnRawResponse += chunk;

      await processParserEvents({
        events: parser.process(chunk),
        turnState,
        budgetState,
        toolResultsThisTurn,
        context: {
          workflow,
          res,
          chatId,
          isFollowUp,
          generatedFiles,
          declaredPackages,
          toolResultsThisTurn,
          runId,
          turn: agentTurn,
          installTaskQueue,
          abortSignal: abortController.signal,
        },
      });

      if (hasAnyTurnBudgetExceeded(budgetState)) {
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

    await processParserEvents({
      events: parser.flush(),
      turnState,
      budgetState,
      toolResultsThisTurn,
      context: {
        workflow,
        res,
        chatId,
        isFollowUp,
        generatedFiles,
        declaredPackages,
        toolResultsThisTurn,
        runId,
        turn: agentTurn,
        installTaskQueue,
        abortSignal: abortController.signal,
      },
    });
    await installTaskQueue.waitForIdle();

    sandboxTagDetected = turnState.sandboxTagDetected;
    totalToolCallsInRun = turnState.totalToolCallsInRun;

    if (responseSizeExceededThisTurn) {
      loopStopReason = AgentLoopStopReason.RESPONSE_SIZE_EXCEEDED;
      sendSSEError(res, "Response exceeded maximum size limit", {
        code: "response_size_exceeded",
        details: { maxBytes: MAX_RESPONSE_SIZE, turn: agentTurn },
      });
      emitTurnCompleteMeta(emitMeta, agentTurn, toolResultsThisTurn.length);
      break;
    }

    if (budgetState.toolBudgetExceededThisTurn) {
      loopStopReason = AgentLoopStopReason.TOOL_BUDGET_EXCEEDED;
      sendSSEError(
        res,
        `Turn reached maximum tool calls (${MAX_AGENT_TOOL_CALLS_PER_TURN})`,
        {
          code: "tool_budget_exceeded",
          details: {
            limit: MAX_AGENT_TOOL_CALLS_PER_TURN,
            turnCount: toolResultsThisTurn.length,
            turn: agentTurn,
          },
        },
      );
      emitTurnCompleteMeta(emitMeta, agentTurn, toolResultsThisTurn.length);
      break;
    }

    if (budgetState.toolRunBudgetExceededThisTurn) {
      loopStopReason = AgentLoopStopReason.RUN_TOOL_BUDGET_EXCEEDED;
      sendSSEError(
        res,
        `Run reached maximum tool calls (${MAX_AGENT_TOOL_CALLS_PER_RUN})`,
        {
          code: "run_tool_budget_exceeded",
          details: {
            limit: MAX_AGENT_TOOL_CALLS_PER_RUN,
            runCount: totalToolCallsInRun,
            turn: agentTurn,
          },
        },
      );
      emitTurnCompleteMeta(emitMeta, agentTurn, toolResultsThisTurn.length);
      break;
    }

    if (budgetState.toolPayloadExceededThisTurn) {
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

    if (toolResultsThisTurn.length > 0 && !abortController.signal.aborted) {
      if (agentTurn >= MAX_AGENT_TURNS) {
        emitTurnCompleteMeta(emitMeta, agentTurn, toolResultsThisTurn.length);
        loopStopReason = AgentLoopStopReason.MAX_TURNS_REACHED;
        break;
      }

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
          doneTagDetectedThisTurn: turnState.doneTagDetectedThisTurn,
        },
        "Agent loop: continuing with tool results",
      );
      emitTurnCompleteMeta(emitMeta, agentTurn, toolResultsThisTurn.length);
      continue agentLoop;
    }

    if (turnState.doneTagDetectedThisTurn) {
      emitTurnCompleteMeta(emitMeta, agentTurn, toolResultsThisTurn.length);
      loopStopReason = AgentLoopStopReason.DONE;
      break;
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

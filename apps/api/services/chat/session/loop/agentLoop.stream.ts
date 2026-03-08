import { type AgentToolResult } from "@edward/shared/streamToolResults";
import type {
  ChatAction,
  Framework,
} from "../../../../services/planning/schemas.js";
import { createStreamParser } from "../../../../lib/llm/parser.js";
import { streamResponse } from "../../../../lib/llm/provider.client.js";
import type { LlmChatMessage } from "../../../../lib/llm/context.js";
import type {
  PromptProfile as PromptProfileType,
} from "../../../../lib/llm/prompts/sections.js";
import {
  MAX_RESPONSE_SIZE,
} from "../../../../utils/constants.js";
import { ensureError } from "../../../../utils/error.js";
import { logger } from "../../../../utils/logger.js";
import { sendSSERecoverableError } from "../../../../services/sse-utils/service.js";
import type { EventHandlerContextParams } from "../shared/meta.js";
import {
  createTurnBudgetState,
  hasAnyTurnBudgetExceeded,
} from "./budgets.js";
import {
  createTurnEventState,
  processParserEvents,
} from "./events.js";

const MAX_STREAM_ATTEMPTS_PER_TURN = 2;

interface InstallTaskQueue {
  enqueue(task: () => Promise<void>): void;
  waitForIdle(): Promise<void>;
}

export interface ExecuteAgentTurnStreamParams {
  decryptedApiKey: string;
  agentMessages: LlmChatMessage[];
  preVerifiedDeps: string[];
  systemPrompt: string;
  framework: Framework | undefined;
  complexity: "simple" | "moderate" | "complex";
  mode: ChatAction;
  promptProfile: PromptProfileType;
  model: string | undefined;
  abortController: AbortController;
  workflow: EventHandlerContextParams["workflow"];
  res: EventHandlerContextParams["res"];
  chatId: string;
  isFollowUp: boolean;
  generatedFiles: Map<string, string>;
  declaredPackages: string[];
  runId: string;
  turn: number;
  installTaskQueue: InstallTaskQueue;
  fullRawResponse: string;
  sandboxTagDetected: boolean;
  totalToolCallsInRun: number;
}

export interface ExecuteAgentTurnStreamResult {
  fullRawResponse: string;
  turnRawResponse: string;
  responseSizeExceededThisTurn: boolean;
  toolResultsThisTurn: AgentToolResult[];
  budgetState: ReturnType<typeof createTurnBudgetState>;
  turnState: ReturnType<typeof createTurnEventState>;
  outputTokensThisTurn?: number;
}

export async function executeAgentTurnStream(
  params: ExecuteAgentTurnStreamParams,
): Promise<ExecuteAgentTurnStreamResult> {
  const parser = createStreamParser();
  const toolResultsThisTurn: AgentToolResult[] = [];
  const budgetState = createTurnBudgetState();
  const turnState = createTurnEventState(
    params.sandboxTagDetected,
    params.totalToolCallsInRun,
  );
  let fullRawResponse = params.fullRawResponse;
  let turnRawResponse = "";
  let responseSizeExceededThisTurn = false;
  let outputTokensThisTurn: number | undefined;
  const parserContext = {
    workflow: params.workflow,
    res: params.res,
    chatId: params.chatId,
    isFollowUp: params.isFollowUp,
    generatedFiles: params.generatedFiles,
    declaredPackages: params.declaredPackages,
    toolResultsThisTurn,
    runId: params.runId,
    turn: params.turn,
    installTaskQueue: params.installTaskQueue,
    abortSignal: params.abortController.signal,
  };

  for (
    let streamAttempt = 1;
    streamAttempt <= MAX_STREAM_ATTEMPTS_PER_TURN;
    streamAttempt += 1
  ) {
    try {
      let attemptOutputTokens: number | undefined;
      const stream = streamResponse(
        params.decryptedApiKey,
        params.agentMessages,
        params.abortController.signal,
        params.preVerifiedDeps,
        params.systemPrompt,
        params.framework,
        params.complexity,
        params.mode,
        params.promptProfile,
        params.model,
        (usage) => {
          if (typeof usage.outputTokens === "number") {
            attemptOutputTokens = usage.outputTokens;
          }
        },
      );

      for await (const chunk of stream) {
        if (params.abortController.signal.aborted) {
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
          context: parserContext,
        });

        if (hasAnyTurnBudgetExceeded(budgetState)) {
          break;
        }
      }

      outputTokensThisTurn = attemptOutputTokens;
      break;
    } catch (streamError) {
      const error = ensureError(streamError);
      const shouldRetry =
        streamAttempt < MAX_STREAM_ATTEMPTS_PER_TURN &&
        !params.abortController.signal.aborted &&
        turnRawResponse.length === 0 &&
        toolResultsThisTurn.length === 0 &&
        !hasAnyTurnBudgetExceeded(budgetState);

      if (!shouldRetry) {
        throw error;
      }

      logger.warn(
        {
          chatId: params.chatId,
          runId: params.runId,
          turn: params.turn,
          attempt: streamAttempt,
          message: error.message,
        },
        "Agent loop stream interrupted before output; retrying turn",
      );
      sendSSERecoverableError(
        params.res,
        "Model stream was interrupted before output; retrying turn once",
        {
          code: "stream_retry",
          details: {
            turn: params.turn,
            attempt: streamAttempt,
          },
        },
      );
    }
  }

  if (!responseSizeExceededThisTurn) {
    await processParserEvents({
      events: parser.flush(),
      turnState,
      budgetState,
      toolResultsThisTurn,
      context: parserContext,
    });
  }
  await params.installTaskQueue.waitForIdle();

  return {
    fullRawResponse,
    turnRawResponse,
    responseSizeExceededThisTurn,
    toolResultsThisTurn,
    budgetState,
    turnState,
    outputTokensThisTurn,
  };
}

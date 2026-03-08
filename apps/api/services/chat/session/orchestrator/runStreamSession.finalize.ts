import type { Response } from "express";
import { MessageRole } from "@edward/auth";
import { RATE_LIMIT_SCOPE } from "@edward/shared/constants";
import {
  MetaPhase,
  ParserEventType,
  type StreamTerminationReason,
} from "@edward/shared/streamEvents";
import type { Framework, ChatAction } from "../../../../services/planning/schemas.js";
import type { TokenUsage } from "../../../../lib/llm/tokens/usage.types.js";
import type { UrlScrapeResult } from "../../../../services/websearch/urlScraper/types.js";
import {
  saveMessage,
} from "../../../../services/chat.service.js";
import {
  getDailyChatSuccessSnapshot,
  recordDailyChatSuccessfulResponse,
} from "../../../../services/rateLimit/chatDailySuccess.service.js";
import {
  formatUrlScrapeAssistantTags,
} from "../../../../services/websearch/urlScraper/context.js";
import { logger } from "../../../../utils/logger.js";
import {
  sendSSEEvent,
  sendSSEDone,
} from "../../../../services/sse-utils/service.js";
import { processBuildPipeline } from "./buildPipeline.js";
import {
  type LoopState,
} from "./runStreamSession.helpers.js";
import {
  createSessionMetrics,
  createStoredAssistantContent,
} from "./runStreamSession.content.js";
import { LOOP_STOP_REASON_TO_TERMINATION } from "./loopStopReasons.js";
import type { EmitMeta } from "../shared/meta.js";

export async function finalizeStreamSession(params: {
  messageStartTime: number;
  tokenUsage: TokenUsage;
  fullRawResponse: string;
  loopState: LoopState;
  urlScrapeResults: UrlScrapeResult[];
  userId: string;
  chatId: string;
  assistantMessageId: string;
  runId: string;
  workflow: { sandboxId?: string };
  res: Response;
  framework: Framework | undefined;
  mode: ChatAction;
  generatedFiles: Map<string, string>;
  declaredPackages: string[];
  emitMeta: EmitMeta;
}): Promise<{ storedAssistantContent: string; terminationReason: StreamTerminationReason }> {
  const {
    messageStartTime,
    tokenUsage,
    fullRawResponse,
    loopState,
    urlScrapeResults,
    userId,
    chatId,
    assistantMessageId,
    runId,
    workflow,
    res,
    framework,
    mode,
    generatedFiles,
    declaredPackages,
    emitMeta,
  } = params;

  const terminationReason =
    LOOP_STOP_REASON_TO_TERMINATION[loopState.loopStopReason];

  logger.info(
    {
      chatId,
      runId,
      agentTurn: loopState.agentTurn,
      loopStopReason: loopState.loopStopReason,
    },
    "Agent loop ended",
  );

  const metrics = createSessionMetrics(
    messageStartTime,
    tokenUsage.inputTokens,
    fullRawResponse,
    tokenUsage.model,
    loopState.outputTokens,
  );

  logger.info(
    {
      chatId,
      runId,
      assistantMessageId,
      completionTime: metrics.completionTime,
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      totalTokens: metrics.inputTokens + metrics.outputTokens,
    },
    "Assistant message completed with metrics",
  );

  sendSSEEvent(res, {
    type: ParserEventType.METRICS,
    completionTime: metrics.completionTime,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
  });

  const urlScrapeTags = formatUrlScrapeAssistantTags(urlScrapeResults);
  const hasRealAssistantResponse = fullRawResponse.trim().length > 0;
  const storedAssistantContent = createStoredAssistantContent(
    fullRawResponse,
    urlScrapeTags,
    loopState.webSearchResults,
    loopState.loopStopReason,
  );

  await saveMessage(
    chatId,
    userId,
    MessageRole.Assistant,
    storedAssistantContent,
    assistantMessageId,
    metrics.messageMetadata,
  );

  if (hasRealAssistantResponse) {
    await recordDailyChatSuccessfulResponse(userId).catch((error: unknown) => {
      logger.warn(
        {
          error,
          chatId,
          runId,
          userId,
        },
        "Failed to record successful daily chat usage",
      );
    });

    const quota = await getDailyChatSuccessSnapshot(userId).catch(
      (error: unknown) => {
        logger.warn(
          {
            error,
            chatId,
            runId,
            userId,
          },
          "Failed to fetch updated daily chat quota snapshot",
        );
        return null;
      },
    );
    if (quota) {
      sendSSEEvent(res, {
        type: ParserEventType.RATE_LIMIT_STATUS,
        scope: RATE_LIMIT_SCOPE.CHAT_DAILY,
        limit: quota.limit,
        remaining: quota.remaining,
        resetAtMs: quota.resetAtMs,
      });
    }
  }

  if (workflow.sandboxId) {
    await processBuildPipeline({
      sandboxId: workflow.sandboxId,
      chatId,
      userId,
      assistantMessageId,
      runId,
      res,
      framework,
      mode,
      generatedFiles,
      declaredPackages,
    });
  } else {
    logger.warn(
      { chatId, runId },
      "[Chat] No sandbox ID available, skipping build",
    );
  }

  emitMeta({
    turn: loopState.agentTurn,
    phase: MetaPhase.SESSION_COMPLETE,
    loopStopReason: loopState.loopStopReason,
    terminationReason,
  });

  sendSSEDone(res);

  return { storedAssistantContent, terminationReason };
}

import type { Response } from "express";
import {
  ParserEventType,
  MetaPhase,
  StreamTerminationReason,
} from "@edward/shared/streamEvents";
import type { AuthenticatedRequest } from "../../../../middleware/auth.js";
import { composePrompt } from "../../../../lib/llm/compose.js";
import {
  computeTokenUsage,
  isOverContextLimit,
  countOutputTokens,
  type TokenUsage,
} from "../../../../lib/llm/tokens.js";
import { cleanupSandbox } from "../../../../services/sandbox/lifecycle/cleanup.js";
import {
  saveMessage,
  type MessageMetadata,
} from "../../../../services/chat.service.js";
import { ensureError } from "../../../../utils/error.js";
import { logger } from "../../../../utils/logger.js";
import { MessageRole } from "@edward/auth";
import {
  ChatAction,
  type WorkflowState,
  type ChatAction as ChatActionType,
  type Framework,
} from "../../../../services/planning/schemas.js";
import {
  formatUrlScrapeAssistantTags,
} from "../../../../services/websearch/urlScraper.service.js";
import {
  classifyAssistantError,
  toAssistantErrorTag,
} from "../../../../lib/llm/errorPresentation.js";

import {
  sendSSEError,
  sendSSEEvent,
  sendSSEDone,
} from "../../sse.utils.js";
import type { LlmChatMessage } from "../../../../lib/llm/context.js";
import type { MessageContent } from "@edward/shared/llm/types";
import { runAgentLoop } from "../loop/agent.loop.js";
import {
  createMetaEmitter,
  type EmitMeta,
} from "../shared/meta.js";
import {
  LOOP_STOP_REASON_TO_ERROR_HINT,
  LOOP_STOP_REASON_TO_TERMINATION,
} from "./loopStopReasons.js";
import { processBuildPipeline } from "./buildPipeline.js";
import { resolveFramework } from "./frameworkResolution.js";
import { prepareBaseMessages } from "./messagePreparation.js";
import { setupStreamGuards } from "./streamGuards.js";
import { scheduleChatMetaGeneration } from "./chatMetaGeneration.js";

export interface StreamSessionParams {
  req: AuthenticatedRequest;
  res: Response;
  externalSignal?: AbortSignal;
  workflow: WorkflowState;
  userId: string;
  chatId: string;
  decryptedApiKey: string;
  userContent: MessageContent;
  userTextContent: string;
  userMessageId: string;
  assistantMessageId: string;
  preVerifiedDeps: string[];
  isFollowUp?: boolean;
  intent?: ChatActionType;
  historyMessages?: LlmChatMessage[];
  projectContext?: string;
  model?: string;
  runId?: string;
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

export async function runStreamSession(
  params: StreamSessionParams,
): Promise<void> {
  const {
    req,
    res,
    workflow,
    userId,
    chatId,
    decryptedApiKey,
    userContent,
    userTextContent,
    userMessageId,
    assistantMessageId,
    preVerifiedDeps,
    isFollowUp = false,
    intent = ChatAction.GENERATE,
    historyMessages = [],
    projectContext = "",
    model,
    runId: explicitRunId,
    resumeCheckpoint,
    onCheckpoint,
    externalSignal,
  } = params;

  let fullRawResponse = "";
  let committedMessageContent: string | null = null;
  const generatedFiles = new Map<string, string>();
  const declaredPackages: string[] = [];
  const messageStartTime = Date.now();
  const runId = explicitRunId ?? assistantMessageId;
  const isNewChat = !isFollowUp;
  const emitMeta: EmitMeta = createMetaEmitter(res, {
    chatId,
    userMessageId,
    assistantMessageId,
    isNewChat,
    runId,
  });

  const abortController = new AbortController();
  const streamGuards = setupStreamGuards({
    req,
    res,
    chatId,
    runId,
    abortController,
    externalSignal,
  });

  let tokenUsage: TokenUsage | undefined;

  try {
    let framework: Framework | undefined =
      workflow.context.framework || workflow.context.intent?.suggestedFramework;
    const complexity = workflow.context.intent?.complexity ?? "moderate";
    const mode =
      intent === ChatAction.FIX
        ? ChatAction.FIX
        : intent === ChatAction.EDIT
          ? ChatAction.EDIT
          : ChatAction.GENERATE;

    framework = await resolveFramework({
      workflow,
      framework,
    });

    const { baseMessages, urlScrapeResults } = await prepareBaseMessages({
      res,
      userTextContent,
      userContent,
      isFollowUp,
      historyMessages,
      projectContext,
    });

    const systemPrompt = composePrompt({
      framework,
      complexity,
      verifiedDependencies: preVerifiedDeps,
      mode,
    });

    tokenUsage = await computeTokenUsage({
      apiKey: decryptedApiKey,
      systemPrompt,
      messages: baseMessages,
      model,
      userPrompt: userTextContent,
    });

    emitMeta({
      phase: MetaPhase.SESSION_START,
      intent,
      tokenUsage,
    });

    if (isOverContextLimit(tokenUsage)) {
      sendSSEError(
        res,
        `Message too large for model context window. Input tokens=${tokenUsage.totalContextTokens}, reservedOutputTokens=${tokenUsage.reservedOutputTokens}, contextWindowTokens=${tokenUsage.contextWindowTokens}.`,
        {
          code: "context_limit_exceeded",
          details: {
            inputTokens: tokenUsage.totalContextTokens,
            reservedOutputTokens: tokenUsage.reservedOutputTokens,
            contextWindowTokens: tokenUsage.contextWindowTokens,
          },
        },
      );

      emitMeta({
        phase: MetaPhase.SESSION_COMPLETE,
        terminationReason: StreamTerminationReason.CONTEXT_LIMIT_EXCEEDED,
      });

      sendSSEDone(res);
      return;
    }

    const loopResult = await runAgentLoop({
      decryptedApiKey,
      initialMessages: baseMessages,
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
    });

    if (loopResult.aborted) {
      const abortReason = streamGuards.getAbortReason();
      const terminationReason: StreamTerminationReason =
        abortReason ?? StreamTerminationReason.ABORTED;
      const isClientDisconnect =
        abortReason === StreamTerminationReason.CLIENT_DISCONNECT;
      emitMeta({
        turn: loopResult.agentTurn,
        phase: MetaPhase.SESSION_COMPLETE,
        loopStopReason: loopResult.loopStopReason,
        terminationReason,
      });

      if (!isClientDisconnect) {
        sendSSEError(res, "Stream aborted before completion", {
          code: terminationReason,
        });
        if (!res.writableEnded) {
          sendSSEDone(res);
        }
      }
      return;
    }

    fullRawResponse = loopResult.fullRawResponse;
    const agentTurn = loopResult.agentTurn;
    const loopStopReason = loopResult.loopStopReason;
    const terminationReason = LOOP_STOP_REASON_TO_TERMINATION[loopStopReason];

    logger.info(
      { chatId, runId, agentTurn, loopStopReason },
      "Agent loop ended",
    );

    const completionTime = Date.now() - messageStartTime;
    const inputTokens = tokenUsage.inputTokens;
    const outputTokens = countOutputTokens(fullRawResponse, model);

    const messageMetadata: MessageMetadata = {
      completionTime,
      inputTokens,
      outputTokens,
    };

    logger.info(
      {
        chatId,
        runId,
        assistantMessageId,
        completionTime,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      "Assistant message completed with metrics",
    );

    sendSSEEvent(res, {
      type: ParserEventType.METRICS,
      completionTime,
      inputTokens,
      outputTokens,
    });

    const urlScrapeTags = formatUrlScrapeAssistantTags(urlScrapeResults);
    const hasAssistantContent = fullRawResponse.trim().length > 0;
    const storedAssistantContent = hasAssistantContent
      ? urlScrapeTags
        ? `${urlScrapeTags}\n\n${fullRawResponse}`
        : fullRawResponse
      : toAssistantErrorTag(
          classifyAssistantError(LOOP_STOP_REASON_TO_ERROR_HINT[loopStopReason]),
        );

    await saveMessage(
      chatId,
      userId,
      MessageRole.Assistant,
      storedAssistantContent,
      assistantMessageId,
      messageMetadata,
    );
    committedMessageContent = storedAssistantContent;

    scheduleChatMetaGeneration({
      isFollowUp,
      decryptedApiKey,
      userContent,
      chatId,
    });

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
      turn: agentTurn,
      phase: MetaPhase.SESSION_COMPLETE,
      loopStopReason,
      terminationReason,
    });

    sendSSEDone(res);
  } catch (streamError) {
    const error = ensureError(streamError);
    const assistantError = classifyAssistantError(error.message);
    if (workflow.sandboxId) {
      await cleanupSandbox(workflow.sandboxId).catch((err: unknown) =>
        logger.error(
          ensureError(err),
          `Cleanup failed after stream error: ${workflow.sandboxId}`,
        ),
      );
    }

    logger.error({ error, chatId, runId }, "Streaming error");

    emitMeta({
      phase: MetaPhase.SESSION_COMPLETE,
      terminationReason: StreamTerminationReason.STREAM_FAILED,
    });

    sendSSEError(res, assistantError.message, {
      code: assistantError.code,
      details: {
        title: assistantError.title,
        severity: assistantError.severity,
        action: assistantError.action,
        actionLabel: assistantError.actionLabel,
        actionUrl: assistantError.actionUrl,
      },
    });

    if (!res.writableEnded) {
      sendSSEDone(res);
    }

    try {
      if (committedMessageContent === null) {
        const errorCompletionTime = Date.now() - messageStartTime;
        const errorInputTokens = tokenUsage?.inputTokens ?? 0;
        const errorOutputTokens = fullRawResponse
          ? countOutputTokens(fullRawResponse, model)
          : 0;

        const errorMetadata: MessageMetadata = {
          completionTime: errorCompletionTime,
          inputTokens: errorInputTokens,
          outputTokens: errorOutputTokens,
        };

        await saveMessage(
          chatId,
          userId,
          MessageRole.Assistant,
          fullRawResponse || toAssistantErrorTag(assistantError),
          assistantMessageId,
          errorMetadata,
        );
      }
    } catch (cleanupErr) {
      logger.error({ cleanupErr }, "Failed during error cleanup");
    }
  } finally {
    streamGuards.clear();
  }
}

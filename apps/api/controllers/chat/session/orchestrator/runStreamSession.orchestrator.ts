import {
  ParserEventType,
  MetaPhase,
} from "@edward/shared/streamEvents";
import { composePrompt } from "../../../../lib/llm/compose.js";
import { PromptProfile } from "../../../../lib/llm/prompts/sections.js";
import {
  computeTokenUsage,
  isOverContextLimit,
  type TokenUsage,
} from "../../../../lib/llm/tokens.js";
import {
  saveMessage,
} from "../../../../services/chat.service.js";
import { logger } from "../../../../utils/logger.js";
import { MessageRole } from "@edward/auth";
import {
  ChatAction,
  type Framework,
} from "../../../../services/planning/schemas.js";
import {
  formatUrlScrapeAssistantTags,
} from "../../../../services/websearch/urlScraper.service.js";
import {
  sendSSEEvent,
  sendSSEDone,
} from "../../sse.utils.js";
import { runAgentLoop } from "../loop/agent.loop.js";
import {
  createMetaEmitter,
  type EmitMeta,
} from "../shared/meta.js";
import {
  LOOP_STOP_REASON_TO_TERMINATION,
} from "./loopStopReasons.js";
import { processBuildPipeline } from "./buildPipeline.js";
import { resolveFramework } from "./frameworkResolution.js";
import { prepareBaseMessages } from "./messagePreparation.js";
import { setupStreamGuards } from "./streamGuards.js";
import { scheduleChatMetaGeneration } from "./chatMetaGeneration.js";
import { applyDeterministicPostgenAutofixes } from "./postgenAutofix.js";
import {
  resolveMode,
  getBlockingPostgenViolations,
  handleContextLimitExceeded,
  handleAbortedLoop,
  createSessionMetrics,
  createStoredAssistantContent,
  handleStreamSessionError,
  type LoopState,
} from "./runStreamSession.helpers.js";
import { maybeRunStrictPostgenRetry } from "./runStreamSession.strictRetry.js";
import type { StreamSessionParams } from "./runStreamSession.types.js";

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
    const mode = resolveMode(intent);

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
      profile: PromptProfile.COMPACT,
      userRequest: userTextContent,
      intentType: workflow.context.intent?.type,
      intentFeatures: workflow.context.intent?.features,
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
      handleContextLimitExceeded(res, tokenUsage, emitMeta);
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
      promptProfile: PromptProfile.COMPACT,
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

    if (
      handleAbortedLoop({
        loopResult,
        streamGuards,
        emitMeta,
        res,
      })
    ) {
      return;
    }

    fullRawResponse = loopResult.fullRawResponse;
    let loopState: LoopState = {
      fullRawResponse: loopResult.fullRawResponse,
      agentTurn: loopResult.agentTurn,
      loopStopReason: loopResult.loopStopReason,
      webSearchResults: loopResult.webSearchResults,
    };

    await applyDeterministicPostgenAutofixes({
      framework,
      mode,
      generatedFiles,
      sandboxId: workflow.sandboxId,
      chatId,
      runId,
    });

    const initialBlockingViolations = getBlockingPostgenViolations({
      generatedFiles,
      framework,
      declaredPackages,
      mode,
    });

    const strictRetryResult = await maybeRunStrictPostgenRetry({
      chatId,
      runId,
      workflow,
      initialBlockingViolations,
      abortController,
      userTextContent,
      mode,
      framework,
      complexity,
      preVerifiedDeps,
      decryptedApiKey,
      model,
      res,
      isFollowUp,
      emitMeta,
      generatedFiles,
      declaredPackages,
      loopState,
      tokenUsage,
    });

    loopState = strictRetryResult.loopState;
    tokenUsage = strictRetryResult.tokenUsage;
    fullRawResponse = loopState.fullRawResponse;

    await applyDeterministicPostgenAutofixes({
      framework,
      mode,
      generatedFiles,
      sandboxId: workflow.sandboxId,
      chatId,
      runId,
    });

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
      turn: loopState.agentTurn,
      phase: MetaPhase.SESSION_COMPLETE,
      loopStopReason: loopState.loopStopReason,
      terminationReason,
    });

    sendSSEDone(res);
  } catch (streamError) {
    await handleStreamSessionError({
      streamError,
      workflow,
      chatId,
      runId,
      emitMeta,
      res,
      committedMessageContent,
      messageStartTime,
      tokenUsage,
      fullRawResponse,
      userId,
      assistantMessageId,
    });
  } finally {
    streamGuards.clear();
  }
}

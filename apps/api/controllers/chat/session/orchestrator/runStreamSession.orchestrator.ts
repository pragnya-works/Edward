import {
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
  ChatAction,
  type Framework,
} from "../../../../services/planning/schemas.js";
import { runAgentLoop } from "../loop/agent.loop.js";
import {
  createMetaEmitter,
  type EmitMeta,
} from "../shared/meta.js";
import { resolveFramework } from "./frameworkResolution.js";
import { prepareBaseMessages } from "./messagePreparation.js";
import { setupStreamGuards } from "./streamGuards.js";
import { applyDeterministicPostgenAutofixes } from "./postgenAutofix.js";
import { scheduleChatMetaGeneration } from "./chatMetaGeneration.js";
import { finalizeStreamSession } from "./runStreamSession.finalize.js";
import {
  resolveMode,
  getBlockingPostgenViolations,
  updateFrameworkFromWorkflow,
  handleContextLimitExceeded,
  handleAbortedLoop,
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
      userRequest: userTextContent,
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

    scheduleChatMetaGeneration({
      isFollowUp,
      decryptedApiKey,
      userContent,
      chatId,
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
    framework = updateFrameworkFromWorkflow(workflow, framework);

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
      intentType: workflow.context.intent?.type,
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
    framework = updateFrameworkFromWorkflow(workflow, framework);

    await applyDeterministicPostgenAutofixes({
      framework,
      mode,
      generatedFiles,
      sandboxId: workflow.sandboxId,
      chatId,
      runId,
    });

    const finalized = await finalizeStreamSession({
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
    });
    committedMessageContent = finalized.storedAssistantContent;
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

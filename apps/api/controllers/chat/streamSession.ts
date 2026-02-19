import type { Response } from "express";
import {
  AgentLoopStopReason,
  MetaPhase,
  ParserEventType,
  StreamTerminationReason,
} from "@edward/shared/stream-events";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { composePrompt } from "../../lib/llm/compose.js";
import {
  computeTokenUsage,
  isOverContextLimit,
  countOutputTokens,
  type TokenUsage,
} from "../../lib/llm/tokens.js";
import { cleanupSandbox } from "../../services/sandbox/lifecycle/cleanup.js";
import { flushSandbox } from "../../services/sandbox/writes.sandbox.js";
import { enqueueBuildJob } from "../../services/queue/enqueue.js";
import {
  saveMessage,
  updateChatMeta,
  type MessageMetadata,
} from "../../services/chat.service.js";
import { generateResponse } from "../../lib/llm/response.js";
import { getSandboxState } from "../../services/sandbox/state.sandbox.js";
import { normalizeFramework } from "../../services/sandbox/templates/template.registry.js";
import { ensureError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";
import { MessageRole, createBuild, updateBuild } from "@edward/auth";
import {
  ChatAction,
  type WorkflowState,
  type ChatAction as ChatActionType,
  type Framework,
} from "../../services/planning/schemas.js";
import { saveWorkflow } from "../../services/planning/workflow/store.js";
import { validateGeneratedOutput } from "../../services/planning/validators/postgenValidator.js";
import {
  MAX_SSE_QUEUE_BYTES,
  MAX_SSE_QUEUE_EVENTS,
  MAX_STREAM_DURATION_MS,
} from "../../utils/sharedConstants.js";
import {
  formatUrlScrapeAssistantTags,
  prepareUrlScrapeContext,
  type UrlScrapeResult,
} from "../../services/websearch/urlScraper.service.js";

import {
  configureSSEBackpressure,
  sendSSEError,
  sendSSEEvent,
  sendSSEDone,
} from "./sse.utils.js";
import type { LlmChatMessage } from "../../lib/llm/context.js";
import {
  type MessageContent,
  getTextFromContent,
} from "../../lib/llm/types.js";
import { runAgentLoop } from "./streamSession.loop.js";
import {
  createMetaEmitter,
  type EmitMeta,
} from "./streamSession.shared.js";

export interface StreamSessionParams {
  req: AuthenticatedRequest;
  res: Response;
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
  let abortReason: StreamTerminationReason | null = null;

  const abortStream = (reason: StreamTerminationReason) => {
    if (!abortController.signal.aborted) {
      abortReason = reason;
      abortController.abort();
    }
  };

  configureSSEBackpressure(res, {
    maxQueueBytes: MAX_SSE_QUEUE_BYTES,
    maxQueueEvents: MAX_SSE_QUEUE_EVENTS,
    onSlowClient: () => {
      logger.warn({ chatId, runId }, "SSE queue overflow - aborting slow client stream");
      abortStream(StreamTerminationReason.SLOW_CLIENT);
    },
  });

  const streamTimer = setTimeout(() => {
    logger.warn({ chatId, runId }, "Stream timeout reached");
    abortStream(StreamTerminationReason.STREAM_TIMEOUT);
  }, MAX_STREAM_DURATION_MS);

  req.on("close", () => {
    logger.info({ chatId, runId }, "Connection closed by client");
    if (streamTimer) clearTimeout(streamTimer);
    abortStream(StreamTerminationReason.CLIENT_DISCONNECT);
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

    const baseMessages: LlmChatMessage[] = [];

    let urlScrapeResults: UrlScrapeResult[] = [];
    let urlScrapeContextMessage: string | null = null;

    const preparedUrlScrape = await prepareUrlScrapeContext({
      promptText: userTextContent,
    });

    if (preparedUrlScrape.results.length > 0) {
      urlScrapeResults = preparedUrlScrape.results;
      urlScrapeContextMessage = preparedUrlScrape.contextMessage;

      sendSSEEvent(res, {
        type: ParserEventType.URL_SCRAPE,
        results: preparedUrlScrape.results.map((result) =>
          result.status === "success"
            ? {
                status: "success" as const,
                url: result.url,
                finalUrl: result.finalUrl,
                title: result.title,
                snippet: result.snippet,
              }
            : {
                status: "error" as const,
                url: result.url,
                error: result.error,
              },
        ),
      });
    }

    if (isFollowUp && historyMessages.length > 0) {
      baseMessages.push(...historyMessages);
    }
    if (isFollowUp && projectContext) {
      baseMessages.push({ role: MessageRole.User, content: projectContext });
    }
    if (urlScrapeContextMessage) {
      baseMessages.push({
        role: MessageRole.User,
        content: urlScrapeContextMessage,
      });
    }
    baseMessages.push({ role: MessageRole.User, content: userContent });

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
    });

    emitMeta({
      phase: MetaPhase.SESSION_START,
      intent,
      tokenUsage,
    });

    if (isOverContextLimit(tokenUsage)) {
      sendSSEError(
        res,
        `Message too large for model context window. Input tokens=${tokenUsage.inputTokens}, reservedOutputTokens=${tokenUsage.reservedOutputTokens}, contextWindowTokens=${tokenUsage.contextWindowTokens}.`,
        {
          code: "context_limit_exceeded",
          details: {
            inputTokens: tokenUsage.inputTokens,
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

    if (!framework && workflow.sandboxId) {
      const sandboxState = await getSandboxState(workflow.sandboxId);
      if (sandboxState?.scaffoldedFramework) {
        const recovered = normalizeFramework(sandboxState.scaffoldedFramework);
        if (recovered) {
          framework = recovered;
          workflow.context.framework = framework;
          await saveWorkflow(workflow);
        }
      }
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
    const terminationReason =
      loopStopReason === AgentLoopStopReason.CONTEXT_LIMIT_EXCEEDED
        ? StreamTerminationReason.CONTEXT_LIMIT_EXCEEDED
        : loopStopReason === AgentLoopStopReason.TOOL_BUDGET_EXCEEDED
          ? StreamTerminationReason.TOOL_BUDGET_EXCEEDED
          : loopStopReason === AgentLoopStopReason.TOOL_PAYLOAD_BUDGET_EXCEEDED
            ? StreamTerminationReason.TOOL_PAYLOAD_BUDGET_EXCEEDED
            : loopStopReason === AgentLoopStopReason.CONTINUATION_BUDGET_EXCEEDED
              ? StreamTerminationReason.CONTINUATION_BUDGET_EXCEEDED
              : loopStopReason === AgentLoopStopReason.RESPONSE_SIZE_EXCEEDED
                ? StreamTerminationReason.RESPONSE_SIZE_EXCEEDED
                : StreamTerminationReason.COMPLETED;

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
    const storedAssistantContent = urlScrapeTags
      ? `${urlScrapeTags}\n\n${fullRawResponse}`
      : fullRawResponse;

    await saveMessage(
      chatId,
      userId,
      MessageRole.Assistant,
      storedAssistantContent,
      assistantMessageId,
      messageMetadata,
    );
    committedMessageContent = storedAssistantContent;

    if (!isFollowUp) {
      generateResponse(
        decryptedApiKey,
        `Generate a title and description for this chat based on the user's request. User said: "${getTextFromContent(userContent).slice(0, 500)}"

Return ONLY a JSON object: {"title": "...", "description": "..."}
- title: max 6 words, concise project name (e.g. "Cloud Storage Dashboard", "Portfolio Website")
- description: max 15 words, what the project does`,
        [],
        undefined,
        { jsonMode: true },
      )
        .then((resp) => {
          const match = resp.match(/\{[\s\S]*\}/);
          if (!match) return;
          const parsed = JSON.parse(match[0]);
          if (parsed.title || parsed.description) {
            return updateChatMeta(chatId, {
              title: parsed.title?.slice(0, 100),
              description: parsed.description?.slice(0, 200),
            });
          }
          return undefined;
        })
        .catch((err) =>
          logger.warn({ err, chatId }, "Title generation failed (non-fatal)"),
        );
    }

    if (workflow.sandboxId) {
      if (generatedFiles.size > 0) {
        const validation = validateGeneratedOutput({
          framework: workflow.context.framework,
          files: generatedFiles,
          declaredPackages,
          mode,
        });
        if (!validation.valid) {
          const errorViolations = validation.violations.filter(
            (v) => v.severity === "error",
          );
          logger.warn(
            { violations: errorViolations, chatId },
            "Post-gen validation found build-breaking issues",
          );
          for (const violation of validation.violations) {
            sendSSEError(res, `[Validation] ${violation.message}`, {
              code: "postgen_validation",
            });
          }
        }
      }

      await flushSandbox(workflow.sandboxId, true).catch((err: unknown) =>
        logger.error(
          ensureError(err),
          `Final flush failed for sandbox: ${workflow.sandboxId}`,
        ),
      );

      const queuedBuild = await createBuild({
        chatId,
        messageId: assistantMessageId,
        status: "queued",
      });

      sendSSEEvent(res, {
        type: ParserEventType.BUILD_STATUS,
        chatId,
        status: "queued",
        buildId: queuedBuild.id,
        runId,
      });

      try {
        await enqueueBuildJob({
          sandboxId: workflow.sandboxId,
          userId,
          chatId,
          messageId: assistantMessageId,
          buildId: queuedBuild.id,
          runId,
        });
      } catch (queueErr) {
        await updateBuild(queuedBuild.id, {
          status: "failed",
          errorReport: {
            failed: true,
            headline: "Failed to enqueue build job",
            details:
              queueErr instanceof Error ? queueErr.message : String(queueErr),
          } as Record<string, unknown>,
        } as Parameters<typeof updateBuild>[1]).catch(() => {});

        sendSSEEvent(res, {
          type: ParserEventType.BUILD_STATUS,
          chatId,
          status: "failed",
          buildId: queuedBuild.id,
          runId,
          errorReport: {
            failed: true,
            headline: "Failed to enqueue build job",
            details:
              queueErr instanceof Error ? queueErr.message : String(queueErr),
          },
        });

        logger.error(
          {
            err: ensureError(queueErr),
            chatId,
            runId,
            sandboxId: workflow.sandboxId,
          },
          "Failed to enqueue build job",
        );
      }
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

    sendSSEError(res, "Stream processing failed", {
      code: "stream_processing_failed",
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
          fullRawResponse || `Error: ${error.message}`,
          assistantMessageId,
          errorMetadata,
        );
      }
    } catch (cleanupErr) {
      logger.error({ cleanupErr }, "Failed during error cleanup");
    }
  } finally {
    if (streamTimer) clearTimeout(streamTimer);
  }
}

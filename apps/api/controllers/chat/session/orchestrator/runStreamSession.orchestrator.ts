import type { Response } from "express";
import {
  AgentLoopStopReason,
  MetaPhase,
  ParserEventType,
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
import { flushSandbox } from "../../../../services/sandbox/write/flush.js";
import { enqueueBuildJob } from "../../../../services/queue/enqueue.js";
import {
  saveMessage,
  updateChatMeta,
  type MessageMetadata,
} from "../../../../services/chat.service.js";
import { generateResponse } from "../../../../lib/llm/provider.client.js";
import { getSandboxState } from "../../../../services/sandbox/state.service.js";
import { normalizeFramework } from "../../../../services/sandbox/templates/template.registry.js";
import { ensureError } from "../../../../utils/error.js";
import { logger } from "../../../../utils/logger.js";
import { MessageRole, createBuild, updateBuild } from "@edward/auth";
import {
  ChatAction,
  type WorkflowState,
  type ChatAction as ChatActionType,
  type Framework,
} from "../../../../services/planning/schemas.js";
import { saveWorkflow } from "../../../../services/planning/workflow/store.js";
import { validateGeneratedOutput } from "../../../../services/planning/validators/postgenValidator.js";
import {
  MAX_SSE_QUEUE_BYTES,
  MAX_SSE_QUEUE_EVENTS,
  MAX_STREAM_DURATION_MS,
} from "../../../../utils/constants.js";
import {
  formatUrlScrapeAssistantTags,
  prepareUrlScrapeContext,
} from "../../../../services/websearch/urlScraper.service.js";
import type { UrlScrapeResult } from "../../../../services/websearch/urlScraper/types.js";
import {
  classifyAssistantError,
  toAssistantErrorTag,
} from "../../../../lib/llm/errorPresentation.js";
import { createRedisClient } from "../../../../lib/redis.js";

import {
  configureSSEBackpressure,
  sendSSEError,
  sendSSEEvent,
  sendSSEDone,
} from "../../sse.utils.js";
import type { LlmChatMessage } from "../../../../lib/llm/context.js";
import {
  getTextFromContent,
} from "../../../../lib/llm/types.js";
import type { MessageContent } from "@edward/shared/llm/types";
import { runAgentLoop } from "../loop/agent.loop.js";
import {
  createMetaEmitter,
  type EmitMeta,
} from "../shared/meta.js";

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

const LOOP_STOP_REASON_TO_TERMINATION: Record<
  AgentLoopStopReason,
  StreamTerminationReason
> = {
  [AgentLoopStopReason.DONE]: StreamTerminationReason.COMPLETED,
  [AgentLoopStopReason.NO_TOOL_RESULTS]: StreamTerminationReason.COMPLETED,
  [AgentLoopStopReason.MAX_TURNS_REACHED]: StreamTerminationReason.COMPLETED,
  [AgentLoopStopReason.CONTEXT_LIMIT_EXCEEDED]:
    StreamTerminationReason.CONTEXT_LIMIT_EXCEEDED,
  [AgentLoopStopReason.TOOL_BUDGET_EXCEEDED]:
    StreamTerminationReason.TOOL_BUDGET_EXCEEDED,
  [AgentLoopStopReason.RUN_TOOL_BUDGET_EXCEEDED]:
    StreamTerminationReason.RUN_TOOL_BUDGET_EXCEEDED,
  [AgentLoopStopReason.TOOL_PAYLOAD_BUDGET_EXCEEDED]:
    StreamTerminationReason.TOOL_PAYLOAD_BUDGET_EXCEEDED,
  [AgentLoopStopReason.CONTINUATION_BUDGET_EXCEEDED]:
    StreamTerminationReason.CONTINUATION_BUDGET_EXCEEDED,
  [AgentLoopStopReason.RESPONSE_SIZE_EXCEEDED]:
    StreamTerminationReason.RESPONSE_SIZE_EXCEEDED,
};

const LOOP_STOP_REASON_TO_ERROR_HINT: Record<AgentLoopStopReason, string> = {
  [AgentLoopStopReason.DONE]:
    "The stream ended before any assistant output was produced.",
  [AgentLoopStopReason.NO_TOOL_RESULTS]:
    "The assistant did not produce output for this request.",
  [AgentLoopStopReason.MAX_TURNS_REACHED]:
    "The assistant reached the maximum number of reasoning turns.",
  [AgentLoopStopReason.TOOL_BUDGET_EXCEEDED]:
    "The assistant hit the per-turn tool budget limit.",
  [AgentLoopStopReason.RUN_TOOL_BUDGET_EXCEEDED]:
    "The assistant hit the run-level tool budget limit.",
  [AgentLoopStopReason.CONTEXT_LIMIT_EXCEEDED]:
    "The prompt exceeded the model context window.",
  [AgentLoopStopReason.TOOL_PAYLOAD_BUDGET_EXCEEDED]:
    "Tool payloads exceeded the per-turn budget.",
  [AgentLoopStopReason.CONTINUATION_BUDGET_EXCEEDED]:
    "Continuation context exceeded allowed limits.",
  [AgentLoopStopReason.RESPONSE_SIZE_EXCEEDED]:
    "The response exceeded the maximum stream size limit.",
};

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
  if (externalSignal) {
    if (externalSignal.aborted) {
      abortStream(StreamTerminationReason.CLIENT_DISCONNECT);
    } else {
      externalSignal.addEventListener(
        "abort",
        () => {
          logger.info({ chatId, runId }, "External abort signal received - cancelling stream");
          if (streamTimer) clearTimeout(streamTimer);
          abortStream(StreamTerminationReason.CLIENT_DISCONNECT);
        },
        { once: true },
      );
    }
  }

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

      const buildStatusPublisher = createRedisClient();
      const buildStatusChannel = `edward:build-status:${chatId}`;
      const publishBuildStatus = async (payload: Record<string, unknown>) => {
        try {
          await buildStatusPublisher.publish(
            buildStatusChannel,
            JSON.stringify(payload),
          );
        } catch (publishErr) {
          logger.warn(
            {
              err: ensureError(publishErr),
              chatId,
              runId,
              buildId: queuedBuild.id,
            },
            "Failed to publish build status update",
          );
        }
      };

      await publishBuildStatus({
        buildId: queuedBuild.id,
        runId,
        status: "queued",
      });

      try {
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
          const enqueueErrorReport = {
            failed: true,
            headline: "Failed to enqueue build job",
            details:
              queueErr instanceof Error ? queueErr.message : String(queueErr),
          };

          await updateBuild(queuedBuild.id, {
            status: "failed",
            errorReport: enqueueErrorReport as Record<string, unknown>,
          } as Parameters<typeof updateBuild>[1]).catch(() => { });

          await publishBuildStatus({
            buildId: queuedBuild.id,
            runId,
            status: "failed",
            errorReport: enqueueErrorReport,
          });

          sendSSEEvent(res, {
            type: ParserEventType.BUILD_STATUS,
            chatId,
            status: "failed",
            buildId: queuedBuild.id,
            runId,
            errorReport: enqueueErrorReport,
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
      } finally {
        await buildStatusPublisher.quit().catch(() => { });
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
    if (streamTimer) clearTimeout(streamTimer);
  }
}

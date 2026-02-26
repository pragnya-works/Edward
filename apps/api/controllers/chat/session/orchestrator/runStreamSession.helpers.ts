import type { Response } from "express";
import {
  MetaPhase,
  StreamTerminationReason,
} from "@edward/shared/streamEvents";
import { MessageRole } from "@edward/auth";
import {
  ChatAction,
  type WorkflowState,
  type ChatAction as ChatActionType,
  type Framework,
} from "../../../../services/planning/schemas.js";
import {
  validateGeneratedOutput,
  type ValidationViolation,
} from "../../../../services/planning/validators/postgenValidator.js";
import {
  classifyAssistantError,
  toAssistantErrorTag,
} from "../../../../lib/llm/errorPresentation.js";
import {
  countOutputTokens,
  type TokenUsage,
} from "../../../../lib/llm/tokens.js";
import {
  saveMessage,
  type MessageMetadata,
} from "../../../../services/chat.service.js";
import type { WebSearchToolResult } from "@edward/shared/streamToolResults";
import { cleanupSandbox } from "../../../../services/sandbox/lifecycle/cleanup.js";
import { ensureError } from "../../../../utils/error.js";
import { logger } from "../../../../utils/logger.js";
import {
  sendSSEError,
  sendSSEDone,
} from "../../sse.utils.js";
import type { EmitMeta } from "../shared/meta.js";
import { runAgentLoop } from "../loop/agent.loop.js";
import { LOOP_STOP_REASON_TO_ERROR_HINT } from "./loopStopReasons.js";

export type AgentLoopResult = Awaited<ReturnType<typeof runAgentLoop>>;
export type LoopStopReason = AgentLoopResult["loopStopReason"];

export interface LoopState {
  fullRawResponse: string;
  agentTurn: number;
  loopStopReason: LoopStopReason;
  webSearchResults: WebSearchToolResult[];
}

interface BlockingViolationsParams {
  generatedFiles: Map<string, string>;
  framework: Framework | undefined;
  declaredPackages: string[];
  mode: ChatActionType;
}

interface AbortedLoopHandlingParams {
  loopResult: AgentLoopResult;
  streamGuards: {
    getAbortReason(): StreamTerminationReason | null;
  };
  emitMeta: EmitMeta;
  res: Response;
}

export interface SessionMetrics {
  completionTime: number;
  inputTokens: number;
  outputTokens: number;
  messageMetadata: MessageMetadata;
}

export function resolveMode(intent: ChatActionType): ChatActionType {
  switch (intent) {
    case ChatAction.FIX:
      return ChatAction.FIX;
    case ChatAction.EDIT:
      return ChatAction.EDIT;
    default:
      return ChatAction.GENERATE;
  }
}

export function getBlockingPostgenViolations({
  generatedFiles,
  framework,
  declaredPackages,
  mode,
}: BlockingViolationsParams): ValidationViolation[] {
  if (generatedFiles.size === 0) {
    return [];
  }

  const validation = validateGeneratedOutput({
    framework,
    files: generatedFiles,
    declaredPackages,
    mode,
  });

  return validation.violations.filter((violation) => violation.severity === "error");
}

export function handleContextLimitExceeded(
  res: Response,
  tokenUsage: TokenUsage,
  emitMeta: EmitMeta,
): void {
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
}

export function handleAbortedLoop({
  loopResult,
  streamGuards,
  emitMeta,
  res,
}: AbortedLoopHandlingParams): boolean {
  if (!loopResult.aborted) {
    return false;
  }

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

  return true;
}

export function createSessionMetrics(
  messageStartTime: number,
  inputTokens: number,
  fullRawResponse: string,
): SessionMetrics {
  const completionTime = Date.now() - messageStartTime;
  const outputTokens = countOutputTokens(fullRawResponse);

  return {
    completionTime,
    inputTokens,
    outputTokens,
    messageMetadata: {
      completionTime,
      inputTokens,
      outputTokens,
    },
  };
}

export function createStoredAssistantContent(
  fullRawResponse: string,
  urlScrapeTags: string,
  webSearchResults: WebSearchToolResult[],
  loopStopReason: LoopStopReason,
): string {
  const hasAssistantContent = fullRawResponse.trim().length > 0;

  if (!hasAssistantContent) {
    return toAssistantErrorTag(
      classifyAssistantError(LOOP_STOP_REASON_TO_ERROR_HINT[loopStopReason]),
    );
  }

  const contentWithWebSearchPayload = injectWebSearchPayloadIntoResponse(
    fullRawResponse,
    webSearchResults,
  );

  const mergedContent = !urlScrapeTags
    ? contentWithWebSearchPayload
    : `${urlScrapeTags}\n\n${contentWithWebSearchPayload}`;

  return stripNoopControlCloseTags(mergedContent);
}

const WEB_SEARCH_TAG_PATTERN = /<edward_web_search\b[^>]*>/gi;
const NOOP_CONTROL_CLOSE_TAG_PATTERN =
  /<\/edward_(?:web_search|command|url_scrape|done)>/gi;

function stripNoopControlCloseTags(content: string): string {
  return content.replace(NOOP_CONTROL_CLOSE_TAG_PATTERN, "");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function encodeJsonToBase64(value: unknown): string | null {
  try {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
  } catch {
    return null;
  }
}

function buildEnrichedWebSearchTag(result: WebSearchToolResult): string {
  const attrs: string[] = [
    `query="${escapeHtmlAttribute(result.query)}"`,
  ];

  if (typeof result.maxResults === "number") {
    attrs.push(`max_results="${result.maxResults}"`);
  }

  if (result.answer?.trim()) {
    const answerPayload = encodeJsonToBase64(result.answer);
    if (answerPayload) {
      attrs.push(`answer_b64="${answerPayload}"`);
    }
  }

  if (result.error?.trim()) {
    const errorPayload = encodeJsonToBase64(result.error);
    if (errorPayload) {
      attrs.push(`error_b64="${errorPayload}"`);
    }
  }

  if (result.results.length > 0) {
    const resultsPayload = encodeJsonToBase64(result.results);
    if (resultsPayload) {
      attrs.push(`results_b64="${resultsPayload}"`);
      attrs.push(`result_count="${result.results.length}"`);
    }
  }

  return `<edward_web_search ${attrs.join(" ")} />`;
}

function injectWebSearchPayloadIntoResponse(
  fullRawResponse: string,
  webSearchResults: WebSearchToolResult[],
): string {
  if (webSearchResults.length === 0) {
    return fullRawResponse;
  }

  let replacementIndex = 0;
  let replacedAnyTag = false;

  const enrichedResponse = fullRawResponse.replace(WEB_SEARCH_TAG_PATTERN, (match) => {
    const nextResult = webSearchResults[replacementIndex];
    if (!nextResult) {
      return match;
    }

    replacementIndex += 1;
    replacedAnyTag = true;
    return buildEnrichedWebSearchTag(nextResult);
  });

  if (!replacedAnyTag) {
    const prefixedTags = webSearchResults
      .map((result) => buildEnrichedWebSearchTag(result))
      .join("\n");
    return prefixedTags ? `${prefixedTags}\n\n${fullRawResponse}` : fullRawResponse;
  }

  if (replacementIndex >= webSearchResults.length) {
    return enrichedResponse;
  }

  const missingTags = webSearchResults
    .slice(replacementIndex)
    .map((result) => buildEnrichedWebSearchTag(result))
    .join("\n");
  if (!missingTags) {
    return enrichedResponse;
  }

  return `${missingTags}\n\n${enrichedResponse}`;
}

export async function persistErrorMessageIfUncommitted({
  committedMessageContent,
  messageStartTime,
  tokenUsage,
  fullRawResponse,
  assistantError,
  chatId,
  userId,
  assistantMessageId,
}: {
  committedMessageContent: string | null;
  messageStartTime: number;
  tokenUsage: TokenUsage | undefined;
  fullRawResponse: string;
  assistantError: ReturnType<typeof classifyAssistantError>;
  chatId: string;
  userId: string;
  assistantMessageId: string;
}): Promise<void> {
  if (committedMessageContent !== null) {
    return;
  }

  const errorCompletionTime = Date.now() - messageStartTime;
  const errorInputTokens = tokenUsage?.inputTokens ?? 0;
  const errorOutputTokens = fullRawResponse
    ? countOutputTokens(fullRawResponse)
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

interface HandleStreamSessionErrorParams {
  streamError: unknown;
  workflow: WorkflowState;
  chatId: string;
  runId: string;
  emitMeta: EmitMeta;
  res: Response;
  committedMessageContent: string | null;
  messageStartTime: number;
  tokenUsage: TokenUsage | undefined;
  fullRawResponse: string;
  userId: string;
  assistantMessageId: string;
}

export async function handleStreamSessionError({
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
}: HandleStreamSessionErrorParams): Promise<void> {
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
    await persistErrorMessageIfUncommitted({
      committedMessageContent,
      messageStartTime,
      tokenUsage,
      fullRawResponse,
      assistantError,
      chatId,
      userId,
      assistantMessageId,
    });
  } catch (cleanupErr) {
    logger.error({ cleanupErr }, "Failed during error cleanup");
  }
}

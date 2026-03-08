import type { AgentLoopStopReason } from "@edward/shared/streamEvents";
import type { WebSearchToolResult } from "@edward/shared/streamToolResults";
import {
  classifyAssistantError,
  toAssistantErrorTag,
} from "../../../../lib/llm/errorPresentation.js";
import { countOutputTokens } from "../../../../lib/llm/tokens/outputCounter.js";
import { LOOP_STOP_REASON_TO_ERROR_HINT } from "./loopStopReasons.js";
import {
  injectWebSearchPayloadIntoResponse,
  stripNoopControlCloseTags,
} from "./runStreamSession.webSearch.js";

export interface SessionMetrics {
  completionTime: number;
  inputTokens: number;
  outputTokens: number;
  messageMetadata: {
    completionTime: number;
    inputTokens: number;
    outputTokens: number;
  };
}

export function createSessionMetrics(
  messageStartTime: number,
  inputTokens: number,
  fullRawResponse: string,
  model?: string,
  exactOutputTokens?: number,
): SessionMetrics {
  const completionTime = Date.now() - messageStartTime;
  const outputTokens = exactOutputTokens ?? countOutputTokens(fullRawResponse, model);

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
  loopStopReason: AgentLoopStopReason,
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

import type { Response } from "express";
import { ParserEventType } from "../../../../../schemas/chat.schema.js";
import { ensureError } from "../../../../../utils/error.js";
import { sendSSEEvent, sendSSERecoverableError } from "../../../sse.utils.js";
import {
  executeWebSearchTool,
  type WebSearchToolResultItem as GatewayWebSearchResultItem,
} from "../../../../../services/tools/toolGateway.service.js";
import type { AgentToolResult } from "@edward/shared/streamToolResults";
import type { WebSearchResultItem } from "@edward/shared/streamEvents";

interface WebSearchEventContext {
  res: Response;
  runId?: string;
  turn?: number;
  toolResultsThisTurn: AgentToolResult[];
}

export async function handleWebSearchEvent(
  ctx: WebSearchEventContext,
  query: string,
  maxResults?: number,
): Promise<void> {
  const normalizedQuery = query.trim();
  const requestedMax = Math.min(Math.max(maxResults ?? 5, 1), 8);

  if (!normalizedQuery) {
    sendSSERecoverableError(ctx.res, "Web search failed: empty query", {
      code: "web_search_failed",
      details: { query: normalizedQuery },
    });
    return;
  }

  sendSSEEvent(ctx.res, {
    type: ParserEventType.WEB_SEARCH,
    query: normalizedQuery,
    maxResults: requestedMax,
  });

  try {
    const search = await executeWebSearchTool({
      runId: ctx.runId,
      turn: ctx.turn ?? 1,
      query: normalizedQuery,
      maxResults: requestedMax,
    });
    const normalizedResults: WebSearchResultItem[] =
      search.results.map((item: GatewayWebSearchResultItem) => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
      }));
    const normalizedAnswer = search.answer;

    ctx.toolResultsThisTurn.push({
      tool: "web_search",
      query: search.query,
      maxResults: requestedMax,
      answer: normalizedAnswer,
      results: normalizedResults,
    });

    sendSSEEvent(ctx.res, {
      type: ParserEventType.WEB_SEARCH,
      query: search.query,
      maxResults: requestedMax,
      answer: normalizedAnswer,
      results: normalizedResults,
    });
  } catch (webSearchError) {
    const err = ensureError(webSearchError);
    ctx.toolResultsThisTurn.push({
      tool: "web_search",
      query: normalizedQuery,
      maxResults: requestedMax,
      results: [],
      error: err.message,
    });
    sendSSEEvent(ctx.res, {
      type: ParserEventType.WEB_SEARCH,
      query: normalizedQuery,
      maxResults: requestedMax,
      error: err.message,
    });
    sendSSERecoverableError(ctx.res, `Web search failed: ${err.message}`, {
      code: "web_search_failed",
      details: { query: normalizedQuery },
    });
  }
}

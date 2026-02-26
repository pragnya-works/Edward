import type { Response } from "express";
import { ParserEventType } from "../../../../../schemas/chat.schema.js";
import { ensureError } from "../../../../../utils/error.js";
import { sendSSEError, sendSSEEvent } from "../../../sse.utils.js";
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
  const requestedMax = Math.min(maxResults ?? 5, 8);

  try {
    const search = await executeWebSearchTool({
      runId: ctx.runId,
      turn: ctx.turn ?? 1,
      query,
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
      query,
      maxResults: requestedMax,
      results: [],
      error: err.message,
    });
    sendSSEError(ctx.res, `Web search failed: ${err.message}`, {
      code: "web_search_failed",
      details: { query },
    });
  }
}

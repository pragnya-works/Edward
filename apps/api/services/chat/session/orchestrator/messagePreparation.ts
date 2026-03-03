import { MessageRole } from "@edward/auth";
import { ParserEventType } from "@edward/shared/streamEvents";
import type { MessageContent } from "@edward/shared/llm/types";
import type { Response } from "express";
import type { LlmChatMessage } from "../../../../lib/llm/context.js";
import { getTextFromContent } from "../../../../lib/llm/types.js";
import { sendSSEEvent } from "../../../../services/sse-utils/service.js";
import {
  prepareUrlScrapeContext,
} from "../../../../services/websearch/urlScraper.service.js";
import type { UrlScrapeResult } from "../../../../services/websearch/urlScraper/types.js";

interface PrepareBaseMessagesParams {
  res: Response;
  userTextContent: string;
  userContent: MessageContent;
  isFollowUp: boolean;
  historyMessages: LlmChatMessage[];
  projectContext: string;
}

interface PreparedMessages {
  baseMessages: LlmChatMessage[];
  urlScrapeResults: UrlScrapeResult[];
}

const MAX_FOLLOW_UP_USER_HISTORY_MESSAGES = 6;
const MAX_FOLLOW_UP_HISTORY_CHARS = 2_800;
const MAX_SINGLE_HISTORY_ITEM_CHARS = 420;
const MAX_PROJECT_CONTEXT_CHARS = 24_000;

function truncateWithMarker(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }
  return `${input.slice(0, maxChars)}\n...[truncated]`;
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function selectFollowUpHistory(
  historyMessages: LlmChatMessage[],
): LlmChatMessage[] {
  const userOnlyHistory = historyMessages.filter(
    (message) => message.role === MessageRole.User,
  );

  if (userOnlyHistory.length <= MAX_FOLLOW_UP_USER_HISTORY_MESSAGES) {
    return userOnlyHistory;
  }

  return userOnlyHistory.slice(-MAX_FOLLOW_UP_USER_HISTORY_MESSAGES);
}

function buildFollowUpHistoryContext(historyMessages: LlmChatMessage[]): string | null {
  const selected = selectFollowUpHistory(historyMessages);
  if (selected.length === 0) {
    return null;
  }

  const lines = selected
    .map((message, index) => {
      const text = normalizeWhitespace(getTextFromContent(message.content));
      if (!text) {
        return "";
      }
      return `${index + 1}. ${truncateWithMarker(text, MAX_SINGLE_HISTORY_ITEM_CHARS)}`;
    })
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const context = `FOLLOW-UP USER HISTORY (COMPACT):
${lines.join("\n")}
Use this as supporting context only. Prioritize the latest user request.`;

  return truncateWithMarker(context, MAX_FOLLOW_UP_HISTORY_CHARS);
}

export async function prepareBaseMessages(
  params: PrepareBaseMessagesParams,
): Promise<PreparedMessages> {
  const {
    res,
    userTextContent,
    userContent,
    isFollowUp,
    historyMessages,
    projectContext,
  } = params;

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
    const compactHistory = buildFollowUpHistoryContext(historyMessages);
    if (compactHistory) {
      baseMessages.push({ role: MessageRole.User, content: compactHistory });
    }
  }
  if (isFollowUp && projectContext) {
    baseMessages.push({
      role: MessageRole.User,
      content: truncateWithMarker(projectContext, MAX_PROJECT_CONTEXT_CHARS),
    });
  }
  if (urlScrapeContextMessage) {
    baseMessages.push({
      role: MessageRole.User,
      content: urlScrapeContextMessage,
    });
  }
  baseMessages.push({ role: MessageRole.User, content: userContent });

  return {
    baseMessages,
    urlScrapeResults,
  };
}

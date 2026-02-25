import { MessageRole } from "@edward/auth";
import { ParserEventType } from "@edward/shared/streamEvents";
import type { MessageContent } from "@edward/shared/llm/types";
import type { Response } from "express";
import type { LlmChatMessage } from "../../../../lib/llm/context.js";
import { sendSSEEvent } from "../../sse.utils.js";
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

  return {
    baseMessages,
    urlScrapeResults,
  };
}

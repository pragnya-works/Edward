import {
  MAX_URLS_PER_PROMPT,
  type PreparedUrlScrapeContext,
  type UrlScrapeResult,
} from "./urlScraper/types.js";
import { extractUrlsFromText as extractUrls } from "./extract/htmlExtract.js";
import { scrapeUrl } from "./network/urlScrape.js";
import {
  buildUrlScrapeContextMessage as buildContextMessage,
  formatUrlScrapeAssistantTags as formatAssistantTags,
} from "./context/contextBuilder.js";

export function extractUrlsFromText(text: string): string[] {
  return extractUrls(text);
}

export function buildUrlScrapeContextMessage(
  results: UrlScrapeResult[],
): string | null {
  return buildContextMessage(results);
}

export function formatUrlScrapeAssistantTags(results: UrlScrapeResult[]): string {
  return formatAssistantTags(results);
}

export async function prepareUrlScrapeContext(input: {
  promptText: string;
}): Promise<PreparedUrlScrapeContext> {
  const requestedUrls = extractUrls(input.promptText).slice(0, MAX_URLS_PER_PROMPT);

  if (requestedUrls.length === 0) {
    return {
      results: [],
      contextMessage: null,
    };
  }

  const results = await Promise.all(requestedUrls.map((url) => scrapeUrl(url)));

  return {
    results,
    contextMessage: buildContextMessage(results),
  };
}

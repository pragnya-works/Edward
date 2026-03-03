import {
  MAX_URLS_PER_PROMPT,
  type PreparedUrlScrapeContext,
} from "./urlScraper/types.js";
import { extractUrlsFromText } from "./urlScraper/extract.js";
import { scrapeUrl } from "./urlScraper/network.js";
import {
  buildUrlScrapeContextMessage,
} from "./urlScraper/context.js";

export async function prepareUrlScrapeContext(input: {
  promptText: string;
}): Promise<PreparedUrlScrapeContext> {
  const requestedUrls = extractUrlsFromText(input.promptText)
    .slice(0, MAX_URLS_PER_PROMPT);

  if (requestedUrls.length === 0) {
    return {
      results: [],
      contextMessage: null,
    };
  }

  const results = await Promise.all(requestedUrls.map((url) => scrapeUrl(url)));

  return {
    results,
    contextMessage: buildUrlScrapeContextMessage(results),
  };
}

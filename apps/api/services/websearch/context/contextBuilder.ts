import {
  buildUrlScrapeContextMessage as buildUrlScrapeContextMessageInternal,
  formatUrlScrapeAssistantTags as formatUrlScrapeAssistantTagsInternal,
} from "../urlScraper/context.js";
import type { UrlScrapeResult } from "../urlScraper/types.js";

export function buildUrlScrapeContextMessage(results: UrlScrapeResult[]): string | null {
  return buildUrlScrapeContextMessageInternal(results);
}

export function formatUrlScrapeAssistantTags(results: UrlScrapeResult[]): string {
  return formatUrlScrapeAssistantTagsInternal(results);
}

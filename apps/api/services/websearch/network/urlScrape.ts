import { scrapeUrl as scrapeUrlInternal } from "../urlScraper/network.js";
import type { UrlScrapeResult } from "../urlScraper/types.js";

export async function scrapeUrl(url: string): Promise<UrlScrapeResult> {
  return scrapeUrlInternal(url);
}

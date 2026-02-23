import { extractUrlsFromText as extractUrlsFromTextInternal } from "../urlScraper/extract.js";

export function extractUrlsFromText(text: string): string[] {
  return extractUrlsFromTextInternal(text);
}

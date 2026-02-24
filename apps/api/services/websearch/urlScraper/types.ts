export const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
export const MAX_URLS_PER_PROMPT = 6;
export const MAX_RESPONSE_BYTES = 1_000_000;
export const FETCH_TIMEOUT_MS = 12_000;
export const MAX_SNIPPET_LENGTH = 320;
export const MAX_CONTEXT_TOTAL_LENGTH = 24_000;
export const MAX_CONTEXT_PER_URL_MIN = 2_000;
export const MAX_CONTEXT_PER_URL_MAX = 10_000;
export const MAX_EXTRACTED_TEXT_PER_URL = 30_000;
export const READABILITY_CHAR_THRESHOLD = 180;

export const LIKELY_TEXT_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "application/json",
  "application/xml",
  "text/xml",
] as const;

export interface UrlScrapeSuccessResult {
  status: "success";
  url: string;
  finalUrl: string;
  title: string;
  snippet: string;
  excerpt: string;
}

export interface UrlScrapeErrorResult {
  status: "error";
  url: string;
  error: string;
}

export type UrlScrapeResult = UrlScrapeSuccessResult | UrlScrapeErrorResult;

export interface PreparedUrlScrapeContext {
  results: UrlScrapeResult[];
  contextMessage: string | null;
}

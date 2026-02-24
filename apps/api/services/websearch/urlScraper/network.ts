import { logger } from "../../../utils/logger.js";
import {
  cancelResponseBody,
  fetchWithSafeRedirects,
  readResponseTextWithLimit,
} from "../../network/safeFetch.js";
import {
  FETCH_TIMEOUT_MS,
  LIKELY_TEXT_CONTENT_TYPES,
  MAX_RESPONSE_BYTES,
  type UrlScrapeResult,
} from "./types.js";
import { extractScrapedContent } from "./extract.js";

function isTextualContentType(contentType: string): boolean {
  if (!contentType) return true;
  return LIKELY_TEXT_CONTENT_TYPES.some((token) => contentType.includes(token));
}

export async function scrapeUrl(url: string): Promise<UrlScrapeResult> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), FETCH_TIMEOUT_MS);

  try {
    const { response, finalUrl } = await fetchWithSafeRedirects(url, {
      signal: abortController.signal,
      maxRedirects: 4,
      accept: "text/html, text/plain, application/json, application/xml",
      userAgent:
        "EdwardBot/1.0 (+https://www.pragnyaa.in; URL context fetcher)",
    });

    if (!response.ok) {
      await cancelResponseBody(response);
      return {
        status: "error",
        url,
        error: `Fetch failed with HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const contentLength = Number.parseInt(
      response.headers.get("content-length") ?? "",
      10,
    );

    if (!Number.isNaN(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      await cancelResponseBody(response);
      return {
        status: "error",
        url,
        error: `Content too large (${contentLength} bytes)`,
      };
    }

    if (!isTextualContentType(contentType)) {
      await cancelResponseBody(response);
      return {
        status: "error",
        url,
        error: `Unsupported content type for text extraction: ${contentType || "unknown"}`,
      };
    }

    const bodyText = await readResponseTextWithLimit(response, MAX_RESPONSE_BYTES);
    const extracted = extractScrapedContent({
      bodyText,
      contentType,
      finalUrl: finalUrl.toString(),
    });

    if (!extracted.excerpt) {
      return {
        status: "error",
        url,
        error: "No readable content extracted from URL",
      };
    }

    logger.info(
      {
        url,
        finalUrl: finalUrl.toString(),
        isHtml: extracted.isHtml,
        usedReadability: extracted.usedReadability,
        extractedChars: extracted.excerpt.length,
      },
      "URL scrape completed",
    );

    return {
      status: "success",
      url,
      finalUrl: finalUrl.toString(),
      title: extracted.title,
      snippet: extracted.snippet,
      excerpt: extracted.excerpt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ url, error: message }, "URL scrape failed");
    return {
      status: "error",
      url,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

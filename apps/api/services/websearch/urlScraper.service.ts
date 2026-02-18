import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import { Readability, isProbablyReaderable } from "@mozilla/readability";
import { JSDOM, type DOMWindow } from "jsdom";
import { logger } from "../../utils/logger.js";

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const MAX_URLS_PER_PROMPT = 6;
const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_SNIPPET_LENGTH = 320;
const MAX_CONTEXT_TOTAL_LENGTH = 24_000;
const MAX_CONTEXT_PER_URL_MIN = 2_000;
const MAX_CONTEXT_PER_URL_MAX = 10_000;
const MAX_EXTRACTED_TEXT_PER_URL = 30_000;
const READABILITY_CHAR_THRESHOLD = 180;

const HTML_BLOCK_TAGS = ["script", "style", "noscript", "svg", "template"];
const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const LIKELY_TEXT_CONTENT_TYPES = [
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

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (full, rawEntity: string) => {
      const entity = rawEntity.toLowerCase();
      if (entity in ENTITY_MAP) {
        return ENTITY_MAP[entity] ?? full;
      }
      if (entity.startsWith("#x")) {
        const codePoint = Number.parseInt(entity.slice(2), 16);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : full;
      }
      if (entity.startsWith("#")) {
        const codePoint = Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : full;
      }
      return full;
    },
  );
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, "\n").replace(/\s+/g, " ").trim();
}

function stripTrailingPunctuation(url: string): string {
  let out = url.trim();
  out = out.replace(/[.,!?;:]+$/g, "");

  while (out.endsWith(")")) {
    const open = (out.match(/\(/g) ?? []).length;
    const close = (out.match(/\)/g) ?? []).length;
    if (close <= open) break;
    out = out.slice(0, -1);
  }

  while (out.endsWith("]")) {
    const open = (out.match(/\[/g) ?? []).length;
    const close = (out.match(/\]/g) ?? []).length;
    if (close <= open) break;
    out = out.slice(0, -1);
  }

  return out;
}

function normalizeUrlCandidate(raw: string): string | null {
  try {
    const cleaned = stripTrailingPunctuation(raw);
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const raw of urls) {
    const normalized = normalizeUrlCandidate(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "metadata.google.internal"
  ) {
    return true;
  }
  return (
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value))) {
    return false;
  }

  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isPrivateIPv4(mapped);
  }

  return false;
}

function isPrivateAddress(address: string): boolean {
  const ipVersion = net.isIP(address);
  if (ipVersion === 4) return isPrivateIPv4(address);
  if (ipVersion === 6) return isPrivateIPv6(address);
  return false;
}

type ResolvedUrlTarget = {
  address: string;
  family: 4 | 6;
};

async function resolveSafeUrlTarget(url: URL): Promise<ResolvedUrlTarget> {
  const hostname = url.hostname.toLowerCase();
  if (isBlockedHostname(hostname)) {
    throw new Error(`URL host is not allowed: ${hostname}`);
  }

  const ipVersion = net.isIP(hostname);
  if (ipVersion > 0) {
    if (isPrivateAddress(hostname)) {
      throw new Error(`Private IP targets are not allowed: ${hostname}`);
    }
    return {
      address: hostname,
      family: ipVersion as 4 | 6,
    };
  }

  const resolved = await dns.lookup(hostname, { all: true, verbatim: true });
  if (resolved.length === 0) {
    throw new Error(`Unable to resolve host: ${hostname}`);
  }

  for (const entry of resolved) {
    if (isPrivateAddress(entry.address)) {
      throw new Error(`Resolved private IP is not allowed: ${entry.address}`);
    }
  }

  const selected = resolved[0];
  if (!selected) {
    throw new Error(`Unable to resolve host: ${hostname}`);
  }

  return {
    address: selected.address,
    family: selected.family as 4 | 6,
  };
}

async function fetchPinned(
  url: URL,
  target: ResolvedUrlTarget,
  signal: AbortSignal,
): Promise<Response> {
  const transport = url.protocol === "https:" ? https : http;

  return new Promise<Response>((resolve, reject) => {
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: target.address,
        family: target.family,
        port: url.port ? Number.parseInt(url.port, 10) : undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        signal,
        servername: url.protocol === "https:" ? url.hostname : undefined,
        headers: {
          accept: "text/html, text/plain, application/json, application/xml",
          "user-agent":
            "EdwardBot/1.0 (+https://www.pragnyaa.in; URL context fetcher)",
          "accept-encoding": "identity",
          host: url.host,
        },
      },
      (incoming) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value === undefined) continue;
          if (Array.isArray(value)) {
            for (const item of value) {
              headers.append(name, item);
            }
            continue;
          }
          headers.set(name, value);
        }

        resolve(
          new Response(
            incoming ? (Readable.toWeb(incoming) as ReadableStream<Uint8Array>) : null,
            {
              status: incoming.statusCode ?? 500,
              statusText: incoming.statusMessage ?? "",
              headers,
            },
          ),
        );
      },
    );

    request.once("error", reject);
    request.end();
  });
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch {
    // Best effort: connection might already be closed or consumed.
  }
}

async function fetchWithSafeRedirects(
  sourceUrl: string,
  signal: AbortSignal,
): Promise<{ response: Response; finalUrl: string }> {
  let current = new URL(sourceUrl);

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt++) {
    const resolvedTarget = await resolveSafeUrlTarget(current);
    const response = await fetchPinned(current, resolvedTarget, signal);

    if (!REDIRECT_STATUSES.has(response.status)) {
      return {
        response,
        finalUrl: current.toString(),
      };
    }

    const nextLocation = response.headers.get("location");
    await cancelResponseBody(response);
    if (!nextLocation) {
      throw new Error(`Redirect response missing location header`);
    }

    current = new URL(nextLocation, current);
  }

  throw new Error(`Too many redirects while fetching URL`);
}

async function readBodyTextWithLimit(
  response: Response,
  limitBytes: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > limitBytes) {
      throw new Error(`Response body exceeds size limit`);
    }
    return text;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limitBytes) {
      await reader.cancel();
      throw new Error(`Response body exceeds size limit`);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

function extractHtmlTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch?.[1]) return null;
  return normalizeWhitespace(decodeHtmlEntities(titleMatch[1]));
}

function extractHtmlDescription(html: string): string | null {
  const descriptionMatch =
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i,
    ) ??
    html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([\s\S]*?)["'][^>]+property=["']og:description["'][^>]*>/i,
    );

  if (!descriptionMatch?.[1]) return null;
  return normalizeWhitespace(decodeHtmlEntities(descriptionMatch[1]));
}

function extractTextFromHtml(html: string): string {
  let output = html;

  for (const tag of HTML_BLOCK_TAGS) {
    const pattern = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    output = output.replace(pattern, " ");
  }

  output = output
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|td)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return normalizeWhitespace(decodeHtmlEntities(output));
}

function extractMetaDescription(document: DOMWindow["document"]): string | null {
  const description =
    document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content") ||
    document
      .querySelector('meta[property="og:description"]')
      ?.getAttribute("content") ||
    document.querySelector('meta[name="twitter:description"]')?.getAttribute("content");

  const normalized = normalizeWhitespace(description || "");
  return normalized || null;
}

function extractVisibleTextFromDom(document: DOMWindow["document"]): string {
  const target =
    document.querySelector(
      "main, article, [role='main'], #content, .content, .article, .post, .docs",
    ) || document.body;

  const text = normalizeWhitespace(target?.textContent || "");
  return text;
}

function isTextualContentType(contentType: string): boolean {
  if (!contentType) return true;
  return LIKELY_TEXT_CONTENT_TYPES.some((token) => contentType.includes(token));
}

function extractReadableContentFromHtml(input: {
  html: string;
  finalUrl: string;
}): {
  title: string | null;
  description: string | null;
  readableText: string;
  usedReadability: boolean;
} {
  const dom = new JSDOM(input.html, {
    url: input.finalUrl,
    contentType: "text/html",
  });

  try {
    const document = dom.window.document;
    const domTitle = normalizeWhitespace(document.title || "");
    const description = extractMetaDescription(document);

    const readerDocument = document.cloneNode(true) as DOMWindow["document"];
    const shouldTryReadability = isProbablyReaderable(readerDocument, {
      minContentLength: 120,
      minScore: 20,
      visibilityChecker: () => true,
    });

    let readabilityText = "";
    let readabilityTitle = "";
    if (shouldTryReadability) {
      const parsed = new Readability(readerDocument, {
        charThreshold: READABILITY_CHAR_THRESHOLD,
        keepClasses: false,
      }).parse();

      readabilityText = normalizeWhitespace(parsed?.textContent || "");
      readabilityTitle = normalizeWhitespace(parsed?.title || "");
    }

    const fallbackText = extractVisibleTextFromDom(document);
    const readableText = readabilityText || fallbackText || extractTextFromHtml(input.html);

    return {
      title: readabilityTitle || domTitle || null,
      description,
      readableText,
      usedReadability: Boolean(readabilityText),
    };
  } finally {
    dom.window.close();
  }
}

function selectTitle(url: string, detectedTitle: string | null): string {
  if (detectedTitle && detectedTitle.length > 0) {
    return truncate(detectedTitle, 120);
  }
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "Untitled page";
  }
}

async function scrapeOneUrl(url: string): Promise<UrlScrapeResult> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), FETCH_TIMEOUT_MS);

  try {
    const { response, finalUrl } = await fetchWithSafeRedirects(
      url,
      abortController.signal,
    );

    if (!response.ok) {
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
      return {
        status: "error",
        url,
        error: `Content too large (${contentLength} bytes)`,
      };
    }

    if (!isTextualContentType(contentType)) {
      return {
        status: "error",
        url,
        error: `Unsupported content type for text extraction: ${contentType || "unknown"}`,
      };
    }

    const bodyText = await readBodyTextWithLimit(response, MAX_RESPONSE_BYTES);
    const isHtml = contentType.includes("text/html");
    const extracted = isHtml
      ? extractReadableContentFromHtml({
          html: bodyText,
          finalUrl,
        })
      : {
          title: null,
          description: null,
          readableText: normalizeWhitespace(bodyText),
          usedReadability: false,
        };

    const fallbackTitle = isHtml ? extractHtmlTitle(bodyText) : null;
    const fallbackDescription = isHtml ? extractHtmlDescription(bodyText) : null;
    const title = selectTitle(finalUrl, extracted.title || fallbackTitle);
    const description = extracted.description || fallbackDescription;
    const readableText = normalizeWhitespace(extracted.readableText);

    if (!readableText) {
      return {
        status: "error",
        url,
        error: "No readable content extracted from URL",
      };
    }

    const snippet = truncate(description || readableText, MAX_SNIPPET_LENGTH);
    const excerpt = truncate(readableText, MAX_EXTRACTED_TEXT_PER_URL);

    logger.info(
      {
        url,
        finalUrl,
        isHtml,
        usedReadability: extracted.usedReadability,
        extractedChars: excerpt.length,
      },
      "URL scrape completed",
    );

    return {
      status: "success",
      url,
      finalUrl,
      title,
      snippet,
      excerpt,
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

export function extractUrlsFromText(text: string): string[] {
  if (!text || !text.trim()) return [];
  const matches = text.match(URL_PATTERN) ?? [];
  return dedupeUrls(matches);
}

export function buildUrlScrapeContextMessage(results: UrlScrapeResult[]): string | null {
  const successes = results.filter(
    (result): result is UrlScrapeSuccessResult => result.status === "success",
  );
  if (successes.length === 0) return null;

  const lines: string[] = [
    "[SCRAPED URL CONTEXT]",
    "The following content was fetched by the system from user-provided URLs. Use it as trusted reference context.",
    "",
  ];

  const perUrlBudget = Math.max(
    MAX_CONTEXT_PER_URL_MIN,
    Math.min(
      MAX_CONTEXT_PER_URL_MAX,
      Math.floor(MAX_CONTEXT_TOTAL_LENGTH / successes.length),
    ),
  );

  let totalChars = 0;
  let index = 1;

  for (const result of successes) {
    const excerpt = truncate(result.excerpt, perUrlBudget);
    if (excerpt.length === 0) continue;

    if (totalChars + excerpt.length > MAX_CONTEXT_TOTAL_LENGTH) {
      const remaining = MAX_CONTEXT_TOTAL_LENGTH - totalChars;
      if (remaining <= 180) break;
      lines.push(`${index}. URL: ${result.finalUrl}`);
      lines.push(`Title: ${result.title}`);
      lines.push(`Excerpt: ${truncate(excerpt, remaining)}`);
      break;
    }

    lines.push(`${index}. URL: ${result.finalUrl}`);
    lines.push(`Title: ${result.title}`);
    lines.push(`Excerpt: ${excerpt}`);
    lines.push("");

    totalChars += excerpt.length;
    index += 1;
  }

  return lines.join("\n").trim();
}

export function formatUrlScrapeAssistantTags(results: UrlScrapeResult[]): string {
  const escaped = (value: string): string =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  return results
    .map((result) => {
      if (result.status === "error") {
        return `<edward_url_scrape url="${escaped(result.url)}" status="error" error="${escaped(truncate(result.error, 180))}" />`;
      }
      return `<edward_url_scrape url="${escaped(result.finalUrl)}" status="success" title="${escaped(truncate(result.title, 120))}" />`;
    })
    .join("\n");
}

export async function prepareUrlScrapeContext(input: {
  promptText: string;
}): Promise<PreparedUrlScrapeContext> {
  const requestedUrls = extractUrlsFromText(input.promptText).slice(
    0,
    MAX_URLS_PER_PROMPT,
  );

  if (requestedUrls.length === 0) {
    return {
      results: [],
      contextMessage: null,
    };
  }

  const results = await Promise.all(
    requestedUrls.map((url) => scrapeOneUrl(url)),
  );

  return {
    results,
    contextMessage: buildUrlScrapeContextMessage(results),
  };
}

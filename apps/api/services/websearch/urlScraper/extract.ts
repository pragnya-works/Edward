import { Readability, isProbablyReaderable } from "@mozilla/readability";
import { JSDOM, type DOMWindow } from "jsdom";
import {
  MAX_EXTRACTED_TEXT_PER_URL,
  MAX_SNIPPET_LENGTH,
  READABILITY_CHAR_THRESHOLD,
  URL_PATTERN,
} from "./types.js";

const HTML_BLOCK_TAGS = ["script", "style", "noscript", "svg", "template"];
const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function truncate(text: string, limit: number): string {
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

export function normalizeWhitespace(text: string): string {
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

export function extractUrlsFromText(text: string): string[] {
  if (!text || !text.trim()) return [];
  const matches = text.match(URL_PATTERN) ?? [];
  return dedupeUrls(matches);
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
    document.querySelector('meta[name="description"]')?.getAttribute("content") ||
    document
      .querySelector('meta[property="og:description"]')
      ?.getAttribute("content") ||
    document
      .querySelector('meta[name="twitter:description"]')
      ?.getAttribute("content");

  const normalized = normalizeWhitespace(description || "");
  return normalized || null;
}

function extractVisibleTextFromDom(document: DOMWindow["document"]): string {
  const target =
    document.querySelector(
      "main, article, [role='main'], #content, .content, .article, .post, .docs",
    ) || document.body;

  return normalizeWhitespace(target?.textContent || "");
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

export function extractScrapedContent(input: {
  bodyText: string;
  contentType: string;
  finalUrl: string;
}): {
  title: string;
  snippet: string;
  excerpt: string;
  isHtml: boolean;
  usedReadability: boolean;
} {
  const isHtml = input.contentType.includes("text/html");

  const extracted = isHtml
    ? extractReadableContentFromHtml({
        html: input.bodyText,
        finalUrl: input.finalUrl,
      })
    : {
        title: null,
        description: null,
        readableText: normalizeWhitespace(input.bodyText),
        usedReadability: false,
      };

  const fallbackTitle = isHtml ? extractHtmlTitle(input.bodyText) : null;
  const fallbackDescription = isHtml
    ? extractHtmlDescription(input.bodyText)
    : null;
  const title = selectTitle(input.finalUrl, extracted.title || fallbackTitle);
  const description = extracted.description || fallbackDescription;
  const readableText = normalizeWhitespace(extracted.readableText);

  const snippet = truncate(description || readableText, MAX_SNIPPET_LENGTH);
  const excerpt = truncate(readableText, MAX_EXTRACTED_TEXT_PER_URL);

  return {
    title,
    snippet,
    excerpt,
    isHtml,
    usedReadability: extracted.usedReadability,
  };
}

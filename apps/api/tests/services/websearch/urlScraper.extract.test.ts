import { describe, expect, it } from "vitest";
import {
  extractScrapedContent,
  extractUrlsFromText,
  normalizeWhitespace,
  truncate,
} from "../../../services/websearch/urlScraper/extract.js";
import {
  MAX_EXTRACTED_TEXT_PER_URL,
  MAX_SNIPPET_LENGTH,
} from "../../../services/websearch/urlScraper/types.js";

describe("url scraper extract", () => {
  it("truncates text with ellipsis", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello world", 5)).toBe("he...");
  });

  it("normalizes whitespace consistently", () => {
    expect(normalizeWhitespace("\r\nfoo   bar\n\n baz")).toBe("foo bar baz");
  });

  it("extracts, sanitizes, and deduplicates URL candidates", () => {
    const text = [
      "Read https://example.com/docs#intro and https://example.com/docs,",
      "ignore ftp://example.com and https://user:pass@example.com/private.",
      "also keep https://example.org/path). and https://example.org/path",
    ].join(" ");

    expect(extractUrlsFromText(text)).toEqual([
      "https://example.com/docs",
      "https://example.org/path",
    ]);
  });

  it("returns empty list for blank input", () => {
    expect(extractUrlsFromText("   ")).toEqual([]);
  });

  it("extracts structured content from plain text", () => {
    const bodyText = "A".repeat(MAX_EXTRACTED_TEXT_PER_URL + 40);

    const extracted = extractScrapedContent({
      bodyText,
      contentType: "text/plain",
      finalUrl: "https://docs.example.com/page",
    });

    expect(extracted.isHtml).toBe(false);
    expect(extracted.usedReadability).toBe(false);
    expect(extracted.title).toBe("docs.example.com");
    expect(extracted.snippet.length).toBe(MAX_SNIPPET_LENGTH);
    expect(extracted.excerpt.length).toBe(MAX_EXTRACTED_TEXT_PER_URL);
  });

  it("extracts html title, metadata snippet, and readable excerpt", () => {
    const html = `
      <html>
        <head>
          <title>Alpha &amp; Beta</title>
          <meta name="description" content="  Deep   docs  for builders " />
        </head>
        <body>
          <main>
            <h1>Docs</h1>
            <p>This page explains architecture boundaries and robust error handling.</p>
          </main>
        </body>
      </html>
    `;

    const extracted = extractScrapedContent({
      bodyText: html,
      contentType: "text/html; charset=utf-8",
      finalUrl: "https://example.com/docs",
    });

    expect(extracted.isHtml).toBe(true);
    expect(extracted.title).toBe("Alpha & Beta");
    expect(extracted.snippet).toBe("Deep docs for builders");
    expect(extracted.excerpt).toContain("This page explains architecture boundaries");
  });

  it("falls back to hostname title when html title is absent", () => {
    const extracted = extractScrapedContent({
      bodyText: "<html><body><main><p>No metadata here.</p></main></body></html>",
      contentType: "text/html",
      finalUrl: "https://www.fallback.example/path",
    });

    expect(extracted.title).toBe("fallback.example");
    expect(extracted.snippet.length).toBeGreaterThan(0);
  });
});

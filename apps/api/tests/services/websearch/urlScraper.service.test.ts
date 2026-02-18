import { describe, expect, it } from "vitest";
import {
  buildUrlScrapeContextMessage,
  extractUrlsFromText,
  formatUrlScrapeAssistantTags,
} from "../../../services/websearch/urlScraper.service.js";

describe("urlScraper service", () => {
  it("extracts and deduplicates HTTP URLs from text", () => {
    const input =
      "Read https://example.com/docs and https://example.com/docs#api, then also https://news.ycombinator.com.";
    const urls = extractUrlsFromText(input);

    expect(urls).toEqual([
      "https://example.com/docs",
      "https://news.ycombinator.com/",
    ]);
  });

  it("builds context only from successful scrape results", () => {
    const context = buildUrlScrapeContextMessage([
      {
        status: "success",
        url: "https://example.com/docs",
        finalUrl: "https://example.com/docs",
        title: "Example Docs",
        snippet: "Intro snippet",
        excerpt: "Detailed extracted text from docs.",
      },
      {
        status: "error",
        url: "https://example.com/fail",
        error: "Timeout",
      },
    ]);

    expect(context).toContain("[SCRAPED URL CONTEXT]");
    expect(context).toContain("https://example.com/docs");
    expect(context).not.toContain("https://example.com/fail");
  });

  it("formats assistant tags for both success and error entries", () => {
    const tags = formatUrlScrapeAssistantTags([
      {
        status: "success",
        url: "https://example.com/docs",
        finalUrl: "https://example.com/docs",
        title: "Example Docs",
        snippet: "Intro snippet",
        excerpt: "Detailed extracted text from docs.",
      },
      {
        status: "error",
        url: "https://example.com/fail",
        error: "Failed to fetch",
      },
    ]);

    expect(tags).toContain('status="success"');
    expect(tags).toContain('status="error"');
    expect(tags).toContain("<edward_url_scrape");
  });
});

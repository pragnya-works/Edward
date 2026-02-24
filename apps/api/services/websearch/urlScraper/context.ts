import {
  MAX_CONTEXT_PER_URL_MAX,
  MAX_CONTEXT_PER_URL_MIN,
  MAX_CONTEXT_TOTAL_LENGTH,
  type UrlScrapeResult,
  type UrlScrapeSuccessResult,
} from "./types.js";
import { truncate } from "./extract.js";

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

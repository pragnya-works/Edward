import type { WebSearchToolResult } from "@edward/shared/streamToolResults";

const WEB_SEARCH_TAG_PATTERN = /<edward_web_search\b[^>]*>/gi;
const NOOP_CONTROL_CLOSE_TAG_PATTERN =
  /<\/edward_(?:web_search|command|url_scrape|done)>/gi;

export function stripNoopControlCloseTags(content: string): string {
  return content.replace(NOOP_CONTROL_CLOSE_TAG_PATTERN, "");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function encodeJsonToBase64(value: unknown): string | null {
  try {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
  } catch {
    return null;
  }
}

function buildEnrichedWebSearchTag(result: WebSearchToolResult): string {
  const attrs: string[] = [
    `query="${escapeHtmlAttribute(result.query)}"`,
  ];

  if (typeof result.maxResults === "number") {
    attrs.push(`max_results="${result.maxResults}"`);
  }

  if (result.answer?.trim()) {
    const answerPayload = encodeJsonToBase64(result.answer);
    if (answerPayload) {
      attrs.push(`answer_b64="${answerPayload}"`);
    }
  }

  if (result.error?.trim()) {
    const errorPayload = encodeJsonToBase64(result.error);
    if (errorPayload) {
      attrs.push(`error_b64="${errorPayload}"`);
    }
  }

  if (result.results.length > 0) {
    const resultsPayload = encodeJsonToBase64(result.results);
    if (resultsPayload) {
      attrs.push(`results_b64="${resultsPayload}"`);
      attrs.push(`result_count="${result.results.length}"`);
    }
  }

  return `<edward_web_search ${attrs.join(" ")} />`;
}

export function injectWebSearchPayloadIntoResponse(
  fullRawResponse: string,
  webSearchResults: WebSearchToolResult[],
): string {
  if (webSearchResults.length === 0) {
    return fullRawResponse;
  }

  let replacementIndex = 0;
  let replacedAnyTag = false;

  const enrichedResponse = fullRawResponse.replace(WEB_SEARCH_TAG_PATTERN, (match) => {
    const nextResult = webSearchResults[replacementIndex];
    if (!nextResult) {
      return match;
    }

    replacementIndex += 1;
    replacedAnyTag = true;
    return buildEnrichedWebSearchTag(nextResult);
  });

  if (!replacedAnyTag) {
    const prefixedTags = webSearchResults
      .map((result) => buildEnrichedWebSearchTag(result))
      .join("\n");
    return prefixedTags ? `${prefixedTags}\n\n${fullRawResponse}` : fullRawResponse;
  }

  if (replacementIndex >= webSearchResults.length) {
    return enrichedResponse;
  }

  const missingTags = webSearchResults
    .slice(replacementIndex)
    .map((result) => buildEnrichedWebSearchTag(result))
    .join("\n");
  if (!missingTags) {
    return enrichedResponse;
  }

  return `${missingTags}\n\n${enrichedResponse}`;
}

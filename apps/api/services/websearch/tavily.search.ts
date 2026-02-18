import { config } from "../../config.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_SNIPPET_LENGTH = 320;

interface TavilyResultItem {
  title?: string;
  url?: string;
  content?: string;
}

interface TavilyApiResponse {
  answer?: string;
  results?: TavilyResultItem[];
}

export interface TavilySearchOutputItem {
  title: string;
  url: string;
  snippet: string;
}

export interface TavilySearchOutput {
  query: string;
  answer?: string;
  results: TavilySearchOutputItem[];
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

export async function searchTavilyBasic(
  query: string,
  maxResults = 5,
): Promise<TavilySearchOutput> {
  const apiKey = config.webSearch.tavilyApiKey;
  if (!apiKey) {
    throw new Error(
      "Web search is not configured. Set TAVILY_API_KEY on the API server.",
    );
  }

  const timeoutMs = DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: Math.min(Math.max(maxResults, 1), 8),
        include_answer: true,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Tavily request failed with status ${response.status}`);
    }

    const data = (await response.json()) as TavilyApiResponse;
    const mappedResults = (data.results ?? []).flatMap((item) => {
      const title = item.title?.trim();
      const url = item.url?.trim();
      if (!title || !url) return [];
      return [
        {
          title,
          url,
          snippet: truncate(item.content?.trim() ?? "", MAX_SNIPPET_LENGTH),
        },
      ];
    });

    return {
      query,
      answer: data.answer?.trim() || undefined,
      results: mappedResults,
    };
  } finally {
    clearTimeout(timer);
  }
}

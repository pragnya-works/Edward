import { config } from "../../app.config.js";

const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_TAVILY_SNIPPET_LENGTH = 320;

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

export function truncateTavilyText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function anyAbortSignal(signals: AbortSignal[]): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const listeners = new Map<AbortSignal, () => void>();

  const cleanup = () => {
    for (const [signal, listener] of listeners) {
      signal.removeEventListener("abort", listener);
    }
    listeners.clear();
  };

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return { signal: controller.signal, cleanup };
    }
  }

  for (const signal of signals) {
    const listener = () => {
      cleanup();
      controller.abort(signal.reason);
    };
    listeners.set(signal, listener);
    signal.addEventListener("abort", listener, { once: true });
  }

  return { signal: controller.signal, cleanup };
}

export async function searchTavilyBasic(
  query: string,
  maxResults = 5,
  signal?: AbortSignal,
): Promise<TavilySearchOutput> {
  const apiKey = config.webSearch.tavilyApiKey;
  if (!apiKey) {
    throw new Error(
      "Web search is not configured. Set TAVILY_API_KEY on the API server.",
    );
  }

  const controller = new AbortController();
  const combinedSignalHandle = signal
    ? anyAbortSignal([signal, controller.signal])
    : null;
  const combinedSignal = combinedSignalHandle?.signal ?? controller.signal;
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

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
      signal: combinedSignal,
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
          snippet: truncateTavilyText(
            item.content?.trim() ?? "",
            MAX_TAVILY_SNIPPET_LENGTH,
          ),
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
    combinedSignalHandle?.cleanup();
  }
}

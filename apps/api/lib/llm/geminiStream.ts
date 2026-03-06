import { createLogger } from "../../utils/logger.js";
import type { GeminiContentPart } from "./types.js";
import { z } from "zod";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com";
const SSE_EVENT_DELIMITER = /\r\n\r\n|\n\n|\r\r/g;
const DONE_SENTINEL = "[DONE]";
const GEMINI_STREAM_IDLE_TIMEOUT_MS = 30_000;
const logger = createLogger("LLM");

interface GeminiStreamContent {
  role: "user" | "model";
  parts: GeminiContentPart[];
}

interface GeminiStreamRequest {
  apiKey: string;
  model: string;
  contents: GeminiStreamContent[];
  systemInstruction: string;
  maxOutputTokens: number;
  topP: number;
  temperature: number;
  signal?: AbortSignal;
}

interface GeminiApiErrorPayload {
  error?: {
    code?: number;
    status?: string;
    message?: string;
  };
}

interface GeminiStreamChunkPayload {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        thought?: boolean;
      }>;
    };
  }>;
  error?: GeminiApiErrorPayload["error"];
}

const geminiApiErrorSchema = z.object({
  error: z
    .object({
      code: z.number().optional(),
      status: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
});

const geminiStreamChunkSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(
                z.object({
                  text: z.string().optional(),
                  thought: z.boolean().optional(),
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  error: geminiApiErrorSchema.shape.error.optional(),
});

function normalizeGeminiModelPath(model: string): string {
  return model.startsWith("models/") || model.startsWith("tunedModels/")
    ? model
    : `models/${model}`;
}

function buildGeminiStreamUrl(apiKey: string, model: string): URL {
  const url = new URL(
    `/v1beta/${normalizeGeminiModelPath(model)}:streamGenerateContent`,
    GEMINI_API_BASE_URL,
  );
  url.searchParams.set("alt", "sse");
  url.searchParams.set("key", apiKey);
  return url;
}

function splitSseEvents(buffer: string): { events: string[]; remainder: string } {
  SSE_EVENT_DELIMITER.lastIndex = 0;
  const events: string[] = [];
  let cursor = 0;

  let match: RegExpExecArray | null;
  while ((match = SSE_EVENT_DELIMITER.exec(buffer)) !== null) {
    events.push(buffer.slice(cursor, match.index));
    cursor = match.index + match[0].length;
  }

  return {
    events,
    remainder: buffer.slice(cursor),
  };
}

function extractSseDataPayload(eventBlock: string): string | null {
  const dataLines: string[] = [];

  for (const line of eventBlock.split(/\r\n|\n|\r/)) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return dataLines.join("\n");
}

function extractGeminiText(payload: GeminiStreamChunkPayload): string {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  let text = "";

  for (const part of parts) {
    if (part?.thought || typeof part?.text !== "string") {
      continue;
    }
    text += part.text;
  }

  return text;
}

function createGeminiApiErrorFromPayload(
  payload: GeminiApiErrorPayload,
  fallbackStatus?: number,
  fallbackStatusText?: string,
): Error {
  const code = payload.error?.code ?? fallbackStatus;
  const status = payload.error?.status ?? fallbackStatusText ?? "Unknown Error";
  const message =
    payload.error?.message ?? "Gemini API request failed without an error body";

  return new Error(`[GoogleGenAI Error]: [${code} ${status}] ${message}`);
}

async function createGeminiHttpError(response: Response): Promise<Error> {
  const rawBody = await response.text().catch(() => "");

  if (rawBody) {
    try {
      const parsed = geminiApiErrorSchema.safeParse(JSON.parse(rawBody) as unknown);
      if (!parsed.success) {
        return new Error(
          `[GoogleGenAI Error]: [${response.status} ${response.statusText}] Invalid Gemini API error payload received from upstream`,
        );
      }

      return createGeminiApiErrorFromPayload(
        parsed.data,
        response.status,
        response.statusText,
      );
    } catch {
      return new Error(
        `[GoogleGenAI Error]: [${response.status} ${response.statusText}] ${rawBody}`,
      );
    }
  }

  return new Error(
    `[GoogleGenAI Error]: [${response.status} ${response.statusText}] Gemini API request failed`,
  );
}

function parseGeminiEventPayload(
  payloadText: string,
): GeminiStreamChunkPayload | null {
  if (!payloadText || payloadText === DONE_SENTINEL) {
    return null;
  }

  const payload = geminiStreamChunkSchema.safeParse(
    JSON.parse(payloadText) as unknown,
  );
  if (!payload.success) {
    throw new Error("Invalid Gemini stream payload received from upstream");
  }

  if (payload.data.error) {
    throw createGeminiApiErrorFromPayload({ error: payload.data.error });
  }

  return payload.data;
}

function buildGeminiStreamRequestBody(params: GeminiStreamRequest): string {
  return JSON.stringify({
    contents: params.contents,
    systemInstruction: {
      role: "user",
      parts: [{ text: params.systemInstruction }],
    },
    generationConfig: {
      maxOutputTokens: params.maxOutputTokens,
      topP: params.topP,
      temperature: params.temperature,
    },
  });
}

function isIncompleteJsonTailError(error: unknown): boolean {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("unexpected end of json") ||
    message.includes("unterminated") ||
    message.includes("end of data") ||
    message.includes("expected")
  );
}

function processGeminiEventBlock(
  eventBlock: string,
): { handled: boolean; text: string } {
  const payloadText = extractSseDataPayload(eventBlock);
  if (!payloadText) {
    return { handled: false, text: "" };
  }

  const payload = parseGeminiEventPayload(payloadText);
  if (!payload) {
    return { handled: true, text: "" };
  }

  return {
    handled: true,
    text: extractGeminiText(payload),
  };
}

function createGeminiTimeoutError(timeoutMs: number): Error {
  return new Error(`Gemini stream request timed out after ${timeoutMs}ms of inactivity`);
}

function createGeminiRequestSignal(signal?: AbortSignal): {
  signal: AbortSignal;
  cleanup: () => void;
  isTimedOut: () => boolean;
  markActivity: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const scheduleTimeout = () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(createGeminiTimeoutError(GEMINI_STREAM_IDLE_TIMEOUT_MS));
    }, GEMINI_STREAM_IDLE_TIMEOUT_MS);
    timeout.unref?.();
  };

  const abortFromCaller = () => {
    controller.abort(signal?.reason);
  };

  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  scheduleTimeout();

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      signal?.removeEventListener("abort", abortFromCaller);
    },
    isTimedOut: () => timedOut,
    markActivity: () => {
      if (!controller.signal.aborted) {
        scheduleTimeout();
      }
    },
  };
}

export async function* streamGeminiResponse(
  params: GeminiStreamRequest,
): AsyncGenerator<string> {
  const requestSignal = createGeminiRequestSignal(params.signal);
  try {
    let response: Response;
    try {
      response = await fetch(buildGeminiStreamUrl(params.apiKey, params.model), {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
        },
        body: buildGeminiStreamRequestBody(params),
        signal: requestSignal.signal,
      });
    } catch (error) {
      if (requestSignal.isTimedOut()) {
        throw createGeminiTimeoutError(GEMINI_STREAM_IDLE_TIMEOUT_MS);
      }
      throw error;
    }
    requestSignal.markActivity();

    if (!response.ok) {
      throw await createGeminiHttpError(response);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Gemini stream response body is empty");
    }

    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let processedAnyEvent = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        requestSignal.markActivity();

        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = splitSseEvents(buffer);
        buffer = remainder;

        for (const eventBlock of events) {
          const processed = processGeminiEventBlock(eventBlock);
          if (!processed.handled) {
            continue;
          }
          processedAnyEvent = true;

          if (processed.text) {
            yield processed.text;
          }
        }
      }

      buffer += decoder.decode();
      const { events, remainder } = splitSseEvents(buffer);

      for (const eventBlock of events) {
        const processed = processGeminiEventBlock(eventBlock);
        if (!processed.handled) {
          continue;
        }
        processedAnyEvent = true;

        if (processed.text) {
          yield processed.text;
        }
      }

      if (!remainder.trim()) {
        return;
      }

      try {
        const trailing = processGeminiEventBlock(remainder);
        if (trailing.handled && trailing.text) {
          yield trailing.text;
        }
        return;
      } catch (error) {
        if (!processedAnyEvent) {
          throw error;
        }
        if (!isIncompleteJsonTailError(error)) {
          throw error;
        }

        logger.warn(
          {
            model: params.model,
            remainderLength: remainder.length,
          },
          "Gemini stream ended with an incomplete trailing SSE payload; ignoring remainder",
        );
      }
    } catch (error) {
      if (requestSignal.isTimedOut()) {
        throw createGeminiTimeoutError(GEMINI_STREAM_IDLE_TIMEOUT_MS);
      }
      throw error;
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  } finally {
    requestSignal.cleanup();
  }
}

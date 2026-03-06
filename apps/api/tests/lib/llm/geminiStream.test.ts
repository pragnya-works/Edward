import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamGeminiResponse } from "../../../lib/llm/geminiStream.js";

function createSseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    {
      status,
      headers: {
        "content-type": "text/event-stream",
      },
    },
  );
}

async function collectStream(chunks: string[]): Promise<string> {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(createSseResponse(chunks)));

  let output = "";
  for await (const chunk of streamGeminiResponse({
    apiKey: "TEST_GEMINI_ID",
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: "Say hello" }] }],
    systemInstruction: "System instructions",
    maxOutputTokens: 1024,
    topP: 0.95,
    temperature: 0.2,
  })) {
    output += chunk;
  }

  return output;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("The operation was aborted.", "AbortError");
  }

  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    "aborted" in value &&
    typeof value.aborted === "boolean" &&
    "addEventListener" in value &&
    typeof value.addEventListener === "function"
  );
}

function createAbortableSseResponse(
  firstChunk: string,
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(firstChunk));
        signal?.addEventListener(
          "abort",
          () => controller.error(createAbortError()),
          { once: true },
        );
      },
      pull() {
        return new Promise(() => undefined);
      },
    }),
    {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
      },
    },
  );
}

function createDelayedSseResponse(
  chunks: Array<{ text: string; delayMs: number }>,
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller): Promise<void> {
        for (const chunk of chunks) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, chunk.delayMs);
            signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(signal.reason ?? createAbortError());
              },
              { once: true },
            );
          });
          controller.enqueue(encoder.encode(chunk.text));
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
      },
    },
  );
}

describe("geminiStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("parses a final SSE event even when the stream omits the terminal delimiter", async () => {
    const output = await collectStream([
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}',
    ]);

    expect(output).toBe("Hello world");
  });

  it("does not swallow a complete final Gemini error event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        createSseResponse([
          'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n',
          'data: {"error":{"code":503,"status":"SERVICE_UNAVAILABLE","message":"Try again later"}}',
        ]),
      ),
    );

    const collect = async (): Promise<string> => {
      let output = "";
      for await (const chunk of streamGeminiResponse({
        apiKey: "TEST_GEMINI_ID",
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: "Say hello" }] }],
        systemInstruction: "System instructions",
        maxOutputTokens: 1024,
        topP: 0.95,
        temperature: 0.2,
      })) {
        output += chunk;
      }
      return output;
    };

    await expect(collect()).rejects.toThrow(
      "[GoogleGenAI Error]: [503 SERVICE_UNAVAILABLE] Try again later",
    );
  });

  it("surfaces Gemini API errors from non-OK HTTP responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 503,
              status: "SERVICE_UNAVAILABLE",
              message: "Try again later",
            },
          }),
          { status: 503, statusText: "Service Unavailable" },
        ),
      ),
    );

    const collect = async (): Promise<void> => {
      for await (const _chunk of streamGeminiResponse({
        apiKey: "TEST_GEMINI_ID",
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: "Say hello" }] }],
        systemInstruction: "System instructions",
        maxOutputTokens: 1024,
        topP: 0.95,
        temperature: 0.2,
      })) {
        // no-op
      }
    };

    await expect(collect()).rejects.toThrow(
      "[GoogleGenAI Error]: [503 SERVICE_UNAVAILABLE] Try again later",
    );
  });

  it("propagates client disconnects while streaming", async () => {
    const abortController = new AbortController();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, init) => {
        const signal = isAbortSignal(init?.signal) ? init.signal : undefined;
        return Promise.resolve(
          createAbortableSseResponse(
            'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n',
            signal,
          ),
        );
      }),
    );

    const iterator = streamGeminiResponse({
      apiKey: "TEST_GEMINI_ID",
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: "Say hello" }] }],
      systemInstruction: "System instructions",
      maxOutputTokens: 1024,
      topP: 0.95,
      temperature: 0.2,
      signal: abortController.signal,
    });

    await expect(iterator.next()).resolves.toMatchObject({
      value: "Hello",
      done: false,
    });

    abortController.abort(createAbortError());

    await expect(iterator.next()).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("times out stalled Gemini fetch requests", async () => {
    vi.useFakeTimers();

    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(
          (_url, init) =>
            new Promise((_resolve, reject) => {
              const signal = isAbortSignal(init?.signal) ? init.signal : undefined;
              if (signal) {
                signal.addEventListener(
                  "abort",
                  () => reject(signal.reason ?? createAbortError()),
                  { once: true },
                );
              }
            }),
        ),
      );

      const collect = async (): Promise<void> => {
        for await (const _chunk of streamGeminiResponse({
          apiKey: "TEST_GEMINI_ID",
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: "Say hello" }] }],
          systemInstruction: "System instructions",
          maxOutputTokens: 1024,
          topP: 0.95,
          temperature: 0.2,
        })) {
          // no-op
        }
      };

      const streamExpectation = expect(collect()).rejects.toThrow(
        "Gemini stream request timed out after 30000ms of inactivity",
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await streamExpectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not time out active streams that continue emitting chunks", async () => {
    vi.useFakeTimers();

    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((_url, init) => {
          const signal = isAbortSignal(init?.signal) ? init.signal : undefined;
          return Promise.resolve(
            createDelayedSseResponse(
              [
                {
                  text: 'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n',
                  delayMs: 20_000,
                },
                {
                  text: 'data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}\n\n',
                  delayMs: 20_000,
                },
              ],
              signal,
            ),
          );
        }),
      );

      const outputPromise = (async (): Promise<string> => {
        let output = "";
        for await (const chunk of streamGeminiResponse({
          apiKey: "TEST_GEMINI_ID",
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: "Say hello" }] }],
          systemInstruction: "System instructions",
          maxOutputTokens: 1024,
          topP: 0.95,
          temperature: 0.2,
        })) {
          output += chunk;
        }
        return output;
      })();
      await vi.advanceTimersByTimeAsync(40_000);

      await expect(outputPromise).resolves.toBe("Hello world");
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries rate-limited Gemini requests and resumes streaming", async () => {
    vi.useFakeTimers();

    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response("rate limited", {
            status: 429,
            statusText: "Too Many Requests",
            headers: {
              "retry-after": "1",
            },
          }),
        )
        .mockResolvedValueOnce(
          createSseResponse([
            'data: {"candidates":[{"content":{"parts":[{"text":"Hello again"}]}}]}\n\n',
          ]),
        );
      vi.stubGlobal("fetch", fetchMock);

      const collect = async (): Promise<string> => {
        let output = "";
        for await (const chunk of streamGeminiResponse({
          apiKey: "TEST_GEMINI_ID",
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: "Say hello" }] }],
          systemInstruction: "System instructions",
          maxOutputTokens: 1024,
          topP: 0.95,
          temperature: 0.2,
        })) {
          output += chunk;
        }

        return output;
      };

      const outputPromise = collect();
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(outputPromise).resolves.toBe("Hello again");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

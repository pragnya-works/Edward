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

    const collect = async () => {
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

    const collect = async () => {
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
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageRole } from "@edward/auth";

const mocks = vi.hoisted(() => ({
  responsesCreateMock: vi.fn(),
  completionsCreateMock: vi.fn(),
  geminiModelsGenerateContentStreamMock: vi.fn(),
  geminiModelsGenerateContentMock: vi.fn(),
  anthropicMessagesCreateMock: vi.fn(),
}));
const OPENAI_TEST_ID = "TEST_OPENAI_ID";
const GEMINI_TEST_ID = "TEST_GEMINI_ID";
const ANTHROPIC_TEST_ID = "TEST_ANTHROPIC_ID";

vi.mock("@edward/shared/constants", () => {
  const Provider = {
    OPENAI: "openai",
    GEMINI: "gemini",
    ANTHROPIC: "anthropic",
  } as const;

  return {
    Provider,
    API_KEY_REGEX: {
      [Provider.OPENAI]: /^TEST_OPENAI_ID$/,
      [Provider.GEMINI]: /^TEST_GEMINI_ID$/,
      [Provider.ANTHROPIC]: /^TEST_ANTHROPIC_ID$/,
    },
  };
});

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    responses: {
      create: mocks.responsesCreateMock,
    },
    completions: {
      create: mocks.completionsCreateMock,
    },
  })),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContentStream: mocks.geminiModelsGenerateContentStreamMock,
      generateContent: mocks.geminiModelsGenerateContentMock,
    },
  })),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: mocks.anthropicMessagesCreateMock,
      countTokens: vi.fn(),
    },
  })),
}));

vi.mock("../../../lib/llm/compose.js", () => ({
  composePrompt: vi.fn(() => "System instructions"),
}));

describe("provider.client legacy completions fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets max_tokens for streaming legacy completions fallback", async () => {
    const { streamResponse } =
      await import("../../../lib/llm/provider.client.js");

    mocks.responsesCreateMock.mockRejectedValueOnce(
      new Error("Use the /v1/completions endpoint for this model"),
    );
    mocks.completionsCreateMock.mockResolvedValueOnce(
      (async function* () {
        yield { choices: [{ text: "Hello" }] };
        yield { choices: [{ text: " world" }] };
      })(),
    );

    let output = "";
    for await (const chunk of streamResponse(OPENAI_TEST_ID, [
      { role: MessageRole.User, content: "Say hello" },
    ])) {
      output += chunk;
    }

    expect(output).toBe("Hello world");
    expect(mocks.completionsCreateMock).toHaveBeenCalledTimes(1);
    const [request] = mocks.completionsCreateMock.mock.calls[0]!;
    expect(request).toMatchObject({
      model: expect.any(String),
      stream: true,
      max_tokens: 4096,
    });
  });

  it("sets max_tokens for non-streaming legacy completions fallback", async () => {
    const { generateResponse } =
      await import("../../../lib/llm/provider.client.js");

    mocks.responsesCreateMock.mockRejectedValueOnce(
      new Error("This is not a chat model; use v1/completions endpoint"),
    );
    mocks.completionsCreateMock.mockResolvedValueOnce({
      choices: [{ text: "Complete answer" }],
    });

    const output = await generateResponse(OPENAI_TEST_ID, "Give answer");

    expect(output).toBe("Complete answer");
    expect(mocks.completionsCreateMock).toHaveBeenCalledTimes(1);
    const [request] = mocks.completionsCreateMock.mock.calls[0]!;
    expect(request).toMatchObject({
      model: expect.any(String),
      max_tokens: 4096,
    });
  });

  it("does not swallow AbortError unless caller signal is aborted", async () => {
    const { streamResponse } =
      await import("../../../lib/llm/provider.client.js");

    const transportAbort = new Error("transport aborted");
    transportAbort.name = "AbortError";
    mocks.responsesCreateMock.mockRejectedValueOnce(transportAbort);

    const collect = async () => {
      for await (const _chunk of streamResponse(OPENAI_TEST_ID, [
        { role: MessageRole.User, content: "Say hello" },
      ])) {
        // no-op
      }
    };

    await expect(collect()).rejects.toThrow("transport aborted");
  });

  it("handles AbortError as cancellation when caller signal is already aborted", async () => {
    const { streamResponse } =
      await import("../../../lib/llm/provider.client.js");
    const abortController = new AbortController();
    abortController.abort();

    const abortedError = new Error("request aborted");
    abortedError.name = "AbortError";
    mocks.responsesCreateMock.mockRejectedValueOnce(abortedError);

    let output = "";
    for await (const chunk of streamResponse(
      OPENAI_TEST_ID,
      [{ role: MessageRole.User, content: "Say hello" }],
      abortController.signal,
    )) {
      output += chunk;
    }

    expect(output).toBe("");
  });
});

describe("provider.client gemini stream resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails the stream when Gemini stream throws", async () => {
    const { streamResponse } =
      await import("../../../lib/llm/provider.client.js");
    const streamError = new Error("stream read failed");

    mocks.geminiModelsGenerateContentStreamMock.mockResolvedValueOnce(
      (async function* () {
        yield { text: "" };
        throw streamError;
      })(),
    );

    const collect = async () => {
      let output = "";
      for await (const chunk of streamResponse(GEMINI_TEST_ID, [
        { role: MessageRole.User, content: "Say hello" },
      ])) {
        output += chunk;
      }
      return output;
    };

    await expect(collect()).rejects.toThrow("stream read failed");
  });

  it("yields text chunks from Gemini stream", async () => {
    const { streamResponse } =
      await import("../../../lib/llm/provider.client.js");
    mocks.geminiModelsGenerateContentStreamMock.mockResolvedValueOnce(
      (async function* () {
        yield { text: "Hello" };
        yield { text: " world" };
      })(),
    );

    let output = "";
    for await (const chunk of streamResponse(GEMINI_TEST_ID, [
      { role: MessageRole.User, content: "Say hello" },
    ])) {
      output += chunk;
    }

    expect(output).toBe("Hello world");
  });

  it("uses Gemini non-stream text output", async () => {
    const { generateResponse } =
      await import("../../../lib/llm/provider.client.js");
    mocks.geminiModelsGenerateContentMock.mockResolvedValueOnce({
      text: "Gemini response",
    });

    const output = await generateResponse(GEMINI_TEST_ID, "Say hello");

    expect(output).toBe("Gemini response");
    expect(mocks.geminiModelsGenerateContentMock).toHaveBeenCalledTimes(1);
  });

  it("sets responseMimeType to JSON for Gemini jsonMode", async () => {
    const { generateResponse } =
      await import("../../../lib/llm/provider.client.js");
    mocks.geminiModelsGenerateContentMock.mockResolvedValueOnce({
      text: '{"ok":true}',
    });

    await generateResponse(
      GEMINI_TEST_ID,
      "Return json",
      undefined,
      undefined,
      {
        jsonMode: true,
      },
    );

    const request = mocks.geminiModelsGenerateContentMock.mock
      .calls[0]?.[0] as {
      config?: { responseMimeType?: string };
    };
    expect(request.config?.responseMimeType).toBe("application/json");
  });
});

describe("provider.client anthropic support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("yields text chunks from Anthropic streaming events", async () => {
    const { streamResponse } =
      await import("../../../lib/llm/provider.client.js");
    mocks.anthropicMessagesCreateMock.mockResolvedValueOnce(
      (async function* () {
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Hello" },
        };
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text: " Claude" },
        };
        yield {
          type: "message_delta",
          usage: { output_tokens: 42 },
        };
      })(),
    );

    let output = "";
    const onUsage = vi.fn();
    for await (const chunk of streamResponse(
      ANTHROPIC_TEST_ID,
      [{ role: MessageRole.User, content: "Say hello" }],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      onUsage,
    )) {
      output += chunk;
    }

    expect(output).toBe("Hello Claude");
    expect(onUsage).toHaveBeenCalledWith({ outputTokens: 42 });
    const request = mocks.anthropicMessagesCreateMock.mock.calls[0]?.[0] as {
      model: string;
      stream: boolean;
      max_tokens: number;
      system: string;
    };
    expect(request.stream).toBe(true);
    expect(request.model).toEqual(expect.any(String));
    expect(request.max_tokens).toBeGreaterThan(0);
    expect(request.system).toBe("System instructions");
    expect(mocks.anthropicMessagesCreateMock.mock.calls[0]?.[1]).toMatchObject({
      timeout: 20 * 60 * 1_000,
    });
  });

  it("uses Anthropic text content for non-streaming generation", async () => {
    const { generateResponse } =
      await import("../../../lib/llm/provider.client.js");
    mocks.anthropicMessagesCreateMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "Anthropic response" }],
    });

    const output = await generateResponse(ANTHROPIC_TEST_ID, "Say hello");

    expect(output).toBe("Anthropic response");
    expect(mocks.anthropicMessagesCreateMock).toHaveBeenCalledTimes(1);
  });

  it("adds JSON-only instruction for Anthropic jsonMode", async () => {
    const { generateResponse } =
      await import("../../../lib/llm/provider.client.js");
    mocks.anthropicMessagesCreateMock.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"ok":true}' }],
    });

    await generateResponse(
      ANTHROPIC_TEST_ID,
      "Return json",
      undefined,
      undefined,
      {
        jsonMode: true,
      },
    );

    const request = mocks.anthropicMessagesCreateMock.mock.calls[0]?.[0] as {
      messages: Array<{
        content: Array<{ type: string; text?: string }>;
      }>;
    };
    expect(request.messages[0]?.content[0]?.text).toContain(
      "Respond with valid JSON only.",
    );
  });

  it("rejects cross-provider model overrides instead of silently falling back", async () => {
    const { streamResponse } =
      await import("../../../lib/llm/provider.client.js");

    await expect(async () => {
      for await (const _chunk of streamResponse(
        OPENAI_TEST_ID,
        [{ role: MessageRole.User, content: "Say hello" }],
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "claude-sonnet-4-5",
      )) {
        // no-op
      }
    }).rejects.toThrow(
      "Selected model is incompatible with the configured provider.",
    );

    expect(mocks.responsesCreateMock).not.toHaveBeenCalled();
  });
});

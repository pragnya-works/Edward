import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageRole } from "@edward/auth";

const mocks = vi.hoisted(() => ({
  responsesCreateMock: vi.fn(),
  completionsCreateMock: vi.fn(),
}));
const OPENAI_TEST_KEY = `sk-${"a".repeat(48)}`;

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

vi.mock("../../../lib/llm/compose.js", () => ({
  composePrompt: vi.fn(() => "System instructions"),
}));

describe("provider.client legacy completions fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets max_tokens for streaming legacy completions fallback", async () => {
    const { streamResponse } = await import("../../../lib/llm/provider.client.js");

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
    for await (const chunk of streamResponse(OPENAI_TEST_KEY, [
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
    const { generateResponse } = await import(
      "../../../lib/llm/provider.client.js"
    );

    mocks.responsesCreateMock.mockRejectedValueOnce(
      new Error("This is not a chat model; use v1/completions endpoint"),
    );
    mocks.completionsCreateMock.mockResolvedValueOnce({
      choices: [{ text: "Complete answer" }],
    });

    const output = await generateResponse(OPENAI_TEST_KEY, "Give answer");

    expect(output).toBe("Complete answer");
    expect(mocks.completionsCreateMock).toHaveBeenCalledTimes(1);
    const [request] = mocks.completionsCreateMock.mock.calls[0]!;
    expect(request).toMatchObject({
      model: expect.any(String),
      max_tokens: 4096,
    });
  });

  it("does not swallow AbortError unless caller signal is aborted", async () => {
    const { streamResponse } = await import("../../../lib/llm/provider.client.js");

    const transportAbort = new Error("transport aborted");
    transportAbort.name = "AbortError";
    mocks.responsesCreateMock.mockRejectedValueOnce(transportAbort);

    const collect = async () => {
      for await (const _chunk of streamResponse(OPENAI_TEST_KEY, [
        { role: MessageRole.User, content: "Say hello" },
      ])) {
        // no-op
      }
    };

    await expect(collect()).rejects.toThrow("transport aborted");
  });

  it("handles AbortError as cancellation when caller signal is already aborted", async () => {
    const { streamResponse } = await import("../../../lib/llm/provider.client.js");
    const abortController = new AbortController();
    abortController.abort();

    const abortedError = new Error("request aborted");
    abortedError.name = "AbortError";
    mocks.responsesCreateMock.mockRejectedValueOnce(abortedError);

    let output = "";
    for await (const chunk of streamResponse(
      OPENAI_TEST_KEY,
      [{ role: MessageRole.User, content: "Say hello" }],
      abortController.signal,
    )) {
      output += chunk;
    }

    expect(output).toBe("");
  });
});

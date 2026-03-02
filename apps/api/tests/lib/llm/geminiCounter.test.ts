import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageRole } from "@edward/auth";
import { countGeminiInputTokens } from "../../../lib/llm/tokens/geminiCounter.js";

const countTokensMock = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      countTokens: countTokensMock,
    };
  },
}));

describe("countGeminiInputTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countTokensMock.mockResolvedValue({ totalTokens: 5 });
  });

  it("formats multimodal message parts for countTokens", async () => {
    await countGeminiInputTokens(
      "system",
      [
        {
          role: MessageRole.User,
          content: [
            { type: "text", text: "hello" },
            { type: "image", mimeType: "image/png", base64: "aGVsbG8=" },
          ],
        },
      ],
      "gemini-2.5-flash",
      "fake-key",
    );

    expect(countTokensMock).toHaveBeenCalledTimes(2);
    const messageCountRequest = countTokensMock.mock.calls[1]?.[0] as {
      contents: Array<{
        parts: unknown[];
      }>;
    };

    expect(messageCountRequest.contents[0]?.parts).toEqual([
      { text: "hello" },
      {
        inlineData: {
          mimeType: "image/png",
          data: "aGVsbG8=",
        },
      },
    ]);
    expect(messageCountRequest).toMatchObject({
      model: "gemini-2.5-flash",
    });
  });

  it("reports only current userPrompt tokens as inputTokens", async () => {
    countTokensMock
      .mockResolvedValueOnce({ totalTokens: 2 })
      .mockResolvedValueOnce({ totalTokens: 3 })
      .mockResolvedValueOnce({ totalTokens: 4 });

    const usage = await countGeminiInputTokens(
      "system",
      [{ role: MessageRole.User, content: "hello" }],
      "gemini-2.5-flash",
      "fake-key",
      "new user prompt",
    );

    expect(countTokensMock).toHaveBeenCalledTimes(3);
    expect(usage.totalContextTokens).toBe(5);
    expect(usage.inputTokens).toBe(4);
  });

  it("reports zero inputTokens when userPrompt is absent", async () => {
    countTokensMock
      .mockResolvedValueOnce({ totalTokens: 2 })
      .mockResolvedValueOnce({ totalTokens: 3 });

    const usage = await countGeminiInputTokens(
      "system",
      [{ role: MessageRole.User, content: "hello" }],
      "gemini-2.5-flash",
      "fake-key",
    );

    expect(countTokensMock).toHaveBeenCalledTimes(2);
    expect(usage.totalContextTokens).toBe(5);
    expect(usage.inputTokens).toBe(0);
  });
});

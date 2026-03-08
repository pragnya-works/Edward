import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageRole } from "@edward/auth";

const mocks = vi.hoisted(() => ({
  countTokensMock: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      countTokens: mocks.countTokensMock,
    },
  })),
}));

describe("countAnthropicInputTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses Anthropic countTokens when available", async () => {
    const { countAnthropicInputTokens } =
      await import("../../../lib/llm/tokens/anthropicCounter.js");

    mocks.countTokensMock
      .mockResolvedValueOnce({ input_tokens: 120 })
      .mockResolvedValueOnce({ input_tokens: 9 })
      .mockResolvedValueOnce({ input_tokens: 15 })
      .mockResolvedValueOnce({ input_tokens: 18 })
      .mockResolvedValueOnce({ input_tokens: 21 })
      .mockResolvedValueOnce({ input_tokens: 11 });

    const usage = await countAnthropicInputTokens(
      "System prompt",
      [
        { role: MessageRole.User, content: "Write code" },
        { role: MessageRole.Assistant, content: "Sure" },
      ],
      "claude-sonnet-4-5",
      "sk-ant-test-key-1234567890",
      "Write code",
    );

    expect(usage.method).toBe("anthropic-countTokens");
    expect(usage.totalContextTokens).toBe(120);
    expect(usage.inputTokens).toBe(11);
    expect(usage.perMessage).toEqual([
      { index: 0, role: MessageRole.System, tokens: 6 },
      { index: 1, role: MessageRole.User, tokens: 18 },
      { index: 2, role: MessageRole.Assistant, tokens: 21 },
    ]);
  });

  it("reports zero inputTokens when userPrompt is omitted", async () => {
    const { countAnthropicInputTokens } =
      await import("../../../lib/llm/tokens/anthropicCounter.js");

    mocks.countTokensMock
      .mockResolvedValueOnce({ input_tokens: 120 })
      .mockResolvedValueOnce({ input_tokens: 9 })
      .mockResolvedValueOnce({ input_tokens: 15 })
      .mockResolvedValueOnce({ input_tokens: 18 })
      .mockResolvedValueOnce({ input_tokens: 21 });

    const usage = await countAnthropicInputTokens(
      "System prompt",
      [
        { role: MessageRole.User, content: "Write code" },
        { role: MessageRole.Assistant, content: "Sure" },
      ],
      "claude-sonnet-4-5",
      "sk-ant-test-key-1234567890",
    );

    expect(usage.method).toBe("anthropic-countTokens");
    expect(usage.inputTokens).toBe(0);
    expect(usage.totalContextTokens).toBe(120);
    expect(usage.perMessage).toEqual([
      { index: 0, role: MessageRole.System, tokens: 6 },
      { index: 1, role: MessageRole.User, tokens: 18 },
      { index: 2, role: MessageRole.Assistant, tokens: 21 },
    ]);
  });

  it("falls back to approximate counting when Anthropic countTokens fails", async () => {
    const { countAnthropicInputTokens } =
      await import("../../../lib/llm/tokens/anthropicCounter.js");

    mocks.countTokensMock.mockRejectedValue(new Error("boom"));

    const usage = await countAnthropicInputTokens(
      "System prompt",
      [{ role: MessageRole.User, content: "Write code" }],
      "claude-sonnet-4-5",
      "sk-ant-test-key-1234567890",
      "Write code",
    );

    expect(usage.method).toBe("approx");
    expect(usage.perMessage[0]).toMatchObject({
      index: 0,
      role: MessageRole.System,
    });
    expect(usage.perMessage[1]).toMatchObject({
      index: 1,
      role: MessageRole.User,
    });
  });
});

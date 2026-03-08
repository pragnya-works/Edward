import { MessageRole } from "@edward/auth";
import { describe, expect, it } from "vitest";
import {
  computeTokenUsage,
  isOverContextLimit,
} from "../../../lib/llm/tokens.js";

describe("computeTokenUsage", () => {
  it("rejects cross-provider model overrides", async () => {
    await expect(
      computeTokenUsage({
        apiKey:
          "sk-proj-test-key-123456789012345678901234567890123456789012345678",
        systemPrompt: "System",
        messages: [{ role: MessageRole.User, content: "Hello" }],
        model: "claude-sonnet-4-5",
      }),
    ).rejects.toThrow(
      "Selected model is incompatible with the configured provider.",
    );
  });

  it("computes OpenAI token usage for a matching provider/model pair", async () => {
    const usage = await computeTokenUsage({
      apiKey:
        "sk-proj-test-key-123456789012345678901234567890123456789012345678",
      systemPrompt: "System",
      messages: [{ role: MessageRole.User, content: "Hello" }],
      model: "gpt-5.3-codex",
      userPrompt: "Hello",
    });

    expect(usage.provider).toBe("openai");
    expect(usage.method).toBe("openai-tiktoken");
    expect(usage.totalContextTokens).toBeGreaterThan(0);
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.perMessage).toEqual([
      expect.objectContaining({ index: 0, role: MessageRole.System }),
      expect.objectContaining({ index: 1, role: MessageRole.User }),
    ]);
  });

  it("returns zero inputTokens when userPrompt is undefined", async () => {
    const usage = await computeTokenUsage({
      apiKey:
        "sk-proj-test-key-123456789012345678901234567890123456789012345678",
      systemPrompt: "",
      messages: [],
      model: "gpt-5.3-codex",
    });

    expect(usage.inputTokens).toBe(0);
    expect(usage.totalContextTokens).toBeGreaterThanOrEqual(0);
    expect(usage.perMessage).toEqual([
      expect.objectContaining({ index: 0, role: MessageRole.System }),
    ]);
  });
});

describe("isOverContextLimit", () => {
  it("returns true only when usage exceeds the context window", () => {
    expect(
      isOverContextLimit({
        totalContextTokens: 90,
        reservedOutputTokens: 20,
        contextWindowTokens: 100,
      } as never),
    ).toBe(true);

    expect(
      isOverContextLimit({
        totalContextTokens: 80,
        reservedOutputTokens: 20,
        contextWindowTokens: 100,
      } as never),
    ).toBe(false);
  });
});

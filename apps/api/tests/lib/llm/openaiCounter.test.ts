import { describe, expect, it } from "vitest";
import { MessageRole } from "@edward/auth";
import { countOpenAIInputTokens } from "../../../lib/llm/tokens/openaiCounter.js";

describe("countOpenAIInputTokens", () => {
  it("reports only userPrompt tokens as inputTokens when userPrompt is provided", () => {
    const userPrompt = "latest user prompt";
    const usage = countOpenAIInputTokens(
      "system prompt",
      [{ role: MessageRole.User, content: "hello from history" }],
      "gpt-4o-mini",
      userPrompt,
    );

    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.inputTokens).toBeLessThan(usage.totalContextTokens);
  });

  it("reports zero inputTokens when userPrompt is absent", () => {
    const usage = countOpenAIInputTokens(
      "system prompt",
      [{ role: MessageRole.User, content: "hello from history" }],
      "gpt-4o-mini",
    );

    expect(usage.inputTokens).toBe(0);
  });
});

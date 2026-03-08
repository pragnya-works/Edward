import { describe, expect, it } from "vitest";
import { Provider } from "../src/constants.js";
import { Model, getModelSpecByProvider, getModelSpec } from "../src/schema.js";

describe("schema Anthropic model metadata", () => {
  it("normalizes Claude 4.5 aliases to canonical API IDs", () => {
    expect(
      getModelSpecByProvider(Provider.ANTHROPIC, "claude-sonnet-4-5")?.id,
    ).toBe(Model.CLAUDE_SONNET_4_5);
    expect(
      getModelSpecByProvider(Provider.ANTHROPIC, "claude-opus-4-5")?.id,
    ).toBe(Model.CLAUDE_OPUS_4_5);
    expect(
      getModelSpecByProvider(Provider.ANTHROPIC, "claude-haiku-4-5")?.id,
    ).toBe(Model.CLAUDE_HAIKU_4_5);
  });

  it("preserves extended context metadata for supported Claude models", () => {
    expect(getModelSpec(Model.CLAUDE_OPUS_4_6)).toMatchObject({
      contextWindowTokens: 200_000,
      extendedContextWindowTokens: 1_000_000,
      maxOutputTokens: 128_000,
      supportsAdaptiveThinking: true,
    });

    expect(getModelSpec(Model.CLAUDE_SONNET_4_6)).toMatchObject({
      contextWindowTokens: 200_000,
      extendedContextWindowTokens: 1_000_000,
      maxOutputTokens: 64_000,
      supportsAdaptiveThinking: true,
    });

    expect(getModelSpec(Model.CLAUDE_HAIKU_4_5)).toMatchObject({
      contextWindowTokens: 200_000,
      maxOutputTokens: 64_000,
      reliableKnowledgeCutoff: "July 2025",
    });
  });

  it("returns null or undefined for invalid and mismatched model lookups", () => {
    expect(
      getModelSpecByProvider(Provider.ANTHROPIC, "claude-unknown-model"),
    ).toBeNull();
    expect(
      getModelSpecByProvider(Provider.OPENAI, Model.CLAUDE_SONNET_4_5),
    ).toBeNull();
    expect(getModelSpec("invalid-model" as Model)).toBeUndefined();
  });
});

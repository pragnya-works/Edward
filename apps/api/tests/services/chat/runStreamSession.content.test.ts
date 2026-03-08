import { describe, expect, it } from "vitest";
import { createSessionMetrics } from "../../../services/chat/session/orchestrator/runStreamSession.content.js";
import { countOutputTokens } from "../../../lib/llm/tokens/outputCounter.js";

describe("createSessionMetrics", () => {
  it("prefers exact output tokens when provided", () => {
    const metrics = createSessionMetrics(
      Date.now() - 100,
      12,
      "This text would tokenize differently",
      "claude-sonnet-4-5",
      77,
    );

    expect(metrics.outputTokens).toBe(77);
    expect(metrics.messageMetadata.outputTokens).toBe(77);
  });

  it("computes output tokens when exact output tokens are omitted", () => {
    const output = "This text would tokenize differently";
    const expectedTokens = countOutputTokens(output, "claude-sonnet-4-5");

    const metrics = createSessionMetrics(
      Date.now() - 100,
      12,
      output,
      "claude-sonnet-4-5",
    );

    expect(metrics.outputTokens).toBe(expectedTokens);
    expect(metrics.messageMetadata.outputTokens).toBe(expectedTokens);
  });

  it("preserves zero exact output tokens", () => {
    const metrics = createSessionMetrics(
      Date.now() - 100,
      12,
      "This text would tokenize differently",
      "claude-sonnet-4-5",
      0,
    );

    expect(metrics.outputTokens).toBe(0);
    expect(metrics.messageMetadata.outputTokens).toBe(0);
  });
});

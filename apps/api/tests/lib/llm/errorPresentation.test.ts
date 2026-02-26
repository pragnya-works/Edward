import { describe, expect, it } from "vitest";
import {
  classifyAssistantError,
  toAssistantErrorTag,
} from "../../../lib/llm/errorPresentation.js";

describe("errorPresentation", () => {
  it("uses retry_generation action for timeout errors", () => {
    const result = classifyAssistantError("Request timed out after 30s");

    expect(result.code).toBe("provider_timeout");
    expect(result.action).toBe("retry_generation");
    expect(result.actionLabel).toBe("Try again");
  });

  it("classifies transient provider high-demand errors as temporary unavailability", () => {
    const result = classifyAssistantError(
      "[GoogleGenerativeAI Error]: [503 Service Unavailable] This model is currently experiencing high demand. Please try again later.",
    );

    expect(result.code).toBe("provider_temporarily_unavailable");
    expect(result.title).toBe("Provider temporarily unavailable");
    expect(result.action).toBe("retry_generation");
    expect(result.actionLabel).toBe("Try again");
  });

  it("uses retry_generation action for unknown generation failures", () => {
    const result = classifyAssistantError("Unexpected upstream failure");

    expect(result.code).toBe("stream_processing_failed");
    expect(result.action).toBe("retry_generation");
    expect(result.actionLabel).toBe("Try again");
  });

  it("serializes retry_generation actions in error tags", () => {
    const tag = toAssistantErrorTag({
      code: "stream_processing_failed",
      title: "Generation failed",
      message: "Please retry.",
      severity: "error",
      action: "retry_generation",
      actionLabel: "Try again",
    });

    expect(tag).toContain('action="retry_generation"');
    expect(tag).toContain('action_label="Try again"');
  });
});

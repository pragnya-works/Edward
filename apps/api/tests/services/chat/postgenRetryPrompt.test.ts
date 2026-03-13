import { describe, expect, it } from "vitest";
import { ChatAction } from "../../../services/planning/schemas.js";
import { buildPostgenRetryPrompt } from "../../../services/chat/session/orchestrator/postgenRetryPrompt.js";
import { MAX_EMITTED_FILE_LINES } from "../../../lib/llm/prompts/sections.js";

describe("buildPostgenRetryPrompt", () => {
  it("repeats the per-file line limit and split guidance", () => {
    const prompt = buildPostgenRetryPrompt({
      originalUserRequest: "Build a dashboard with charts and filters",
      mode: ChatAction.GENERATE,
      violations: [
        {
          type: "missing-entry-point",
          severity: "error",
          message: "Missing required entry point: src/App.tsx",
          file: "src/App.tsx",
        },
      ],
    });

    expect(prompt).toContain(
      `Keep every emitted <file> at or below ${MAX_EMITTED_FILE_LINES} total lines.`,
    );
    expect(prompt).toContain(
      "If a file is becoming too large, split the fix across smaller helper/component/hook/style files instead of overloading one file.",
    );
  });
});

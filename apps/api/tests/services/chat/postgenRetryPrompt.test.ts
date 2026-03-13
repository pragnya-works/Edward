import { describe, expect, it } from "vitest";
import { ChatAction } from "../../../services/planning/schemas.js";
import { buildPostgenRetryPrompt } from "../../../services/chat/session/orchestrator/postgenRetryPrompt.js";
import { MAX_EMITTED_FILE_LINES } from "../../../lib/llm/prompts/sections.js";

describe("buildPostgenRetryPrompt", () => {
  const violations = [
    {
      type: "missing-entry-point" as const,
      severity: "error" as const,
      message: "Missing required entry point: src/App.tsx",
      file: "src/App.tsx",
    },
  ];

  it("repeats the per-file line limit and split guidance", () => {
    const prompt = buildPostgenRetryPrompt({
      originalUserRequest: "Build a dashboard with charts and filters",
      mode: ChatAction.GENERATE,
      violations,
    });

    expect(prompt).toContain(
      `Keep every emitted <file> at or below ${MAX_EMITTED_FILE_LINES} total lines.`,
    );
    expect(prompt).toContain(
      "If a file is becoming too large, split the fix across smaller helper/component/hook/style files instead of overloading one file.",
    );
  });

  it.each([ChatAction.FIX, ChatAction.EDIT])(
    "uses targeted retry guidance for %s mode and keeps shared file-size reminders",
    (mode) => {
      const prompt = buildPostgenRetryPrompt({
        originalUserRequest: "Repair the broken dashboard interactions",
        mode,
        violations,
      });

      expect(prompt).toContain(
        "Apply only the minimum targeted fixes required to resolve all listed validation errors.",
      );
      expect(prompt).toContain(
        `Keep every emitted <file> at or below ${MAX_EMITTED_FILE_LINES} total lines.`,
      );
      expect(prompt).toContain(
        "If a file is becoming too large, split the fix across smaller helper/component/hook/style files instead of overloading one file.",
      );
    },
  );
});

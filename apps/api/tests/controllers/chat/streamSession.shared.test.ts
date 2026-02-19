import { describe, expect, it } from "vitest";
import { buildAgentContinuationPrompt } from "../../../controllers/chat/streamSession.shared.js";
import { MAX_AGENT_CONTINUATION_PROMPT_CHARS } from "../../../utils/sharedConstants.js";

describe("buildAgentContinuationPrompt", () => {
  it("returns non-truncated prompt for small payloads", () => {
    const result = buildAgentContinuationPrompt("Build a todo app", "Done.", [
      {
        tool: "command",
        command: "pnpm",
        args: ["build"],
        stdout: "ok",
        stderr: "",
      },
    ]);

    expect(result.truncated).toBe(false);
    expect(result.prompt).toContain("ORIGINAL REQUEST");
    expect(result.prompt).toContain("TOOL RESULTS");
  });

  it("marks continuation as truncated when payload exceeds budget", () => {
    const veryLargeStdout = "x".repeat(MAX_AGENT_CONTINUATION_PROMPT_CHARS);
    const veryLargeUserText = "u".repeat(MAX_AGENT_CONTINUATION_PROMPT_CHARS);
    const veryLargePreviousResponse = "r".repeat(
      MAX_AGENT_CONTINUATION_PROMPT_CHARS,
    );
    const result = buildAgentContinuationPrompt(
      veryLargeUserText,
      veryLargePreviousResponse,
      [
        {
          tool: "command",
          command: "cat",
          args: ["large.log"],
          stdout: veryLargeStdout,
          stderr: "",
        },
      ],
    );

    expect(result.truncated).toBe(true);
    expect(result.prompt.length).toBeLessThanOrEqual(
      MAX_AGENT_CONTINUATION_PROMPT_CHARS + 20,
    );
    expect(result.prompt).toContain("...[truncated]");
  });
});

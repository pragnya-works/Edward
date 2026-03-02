import { describe, expect, it } from "vitest";
import { buildAgentContinuationPrompt } from "../../../controllers/chat/session/shared/continuation.js";
import { MAX_AGENT_CONTINUATION_PROMPT_CHARS } from "../../../utils/constants.js";

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
    expect(result.prompt).toContain("Do not ask the user to run commands");
  });

  it("keeps continuation prompt within budget for oversized payloads", () => {
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

    expect(result.truncated).toBe(false);
    expect(result.prompt.length).toBeLessThanOrEqual(
      MAX_AGENT_CONTINUATION_PROMPT_CHARS + 20,
    );
    expect(result.prompt).toContain("...[truncated]");
  });

  it("sanitizes prior response tags before building continuation prompt", () => {
    const result = buildAgentContinuationPrompt(
      "fix the failing build",
      `<Thinking>internal details</Thinking>
<Response>I will check the logs next.</Response>
<edward_command command="pnpm" args='["build"]'>`,
      [],
    );

    expect(result.truncated).toBe(false);
    expect(result.prompt).toContain("YOUR PREVIOUS RESPONSE (SANITIZED)");
    expect(result.prompt).toContain("I will check the logs next.");
    expect(result.prompt).not.toContain("<edward_command");
    expect(result.prompt).not.toContain("internal details");
  });

  it("compacts oversized tool outputs in continuation prompt", () => {
    const noisyOutput = `${"line\n".repeat(12_000)}end`;
    const result = buildAgentContinuationPrompt("fix build", "Done", [
      {
        tool: "command",
        command: "pnpm",
        args: ["build"],
        stdout: noisyOutput,
        stderr: "",
      },
    ]);

    expect(result.truncated).toBe(false);
    expect(result.prompt).toContain("$ pnpm build");
    expect(result.prompt).toContain("...[truncated]...");
  });

  it("keeps medium command outputs intact when they fit the continuation budget", () => {
    const output = `${"line\n".repeat(900)}done`;
    const result = buildAgentContinuationPrompt("inspect file", "Done", [
      {
        tool: "command",
        command: "cat",
        args: ["src/index.ts"],
        stdout: output,
        stderr: "",
      },
    ]);

    expect(result.truncated).toBe(false);
    expect(result.prompt).toContain("$ cat src/index.ts");
    expect(result.prompt).toContain("done");
    expect(result.prompt).not.toContain("...[truncated]...");
  });

  it("stays within context budget under many very large tool results", () => {
    const largeToolResults = Array.from({ length: 12 }, (_, index) => ({
      tool: "command" as const,
      command: "cat",
      args: [`src/file-${index}.ts`],
      stdout: `${"x".repeat(16_000)}\nmarker-${index}`,
      stderr: "",
    }));

    const result = buildAgentContinuationPrompt(
      "fix all build issues",
      "r".repeat(MAX_AGENT_CONTINUATION_PROMPT_CHARS),
      largeToolResults,
    );

    expect(result.prompt.length).toBeLessThanOrEqual(
      MAX_AGENT_CONTINUATION_PROMPT_CHARS + 20,
    );
    expect(result.prompt).toContain("$ cat src/file-0.ts");
    expect(result.prompt).toContain("$ cat src/file-11.ts");
    expect(result.prompt).toContain("...[truncated]...");
  });
});

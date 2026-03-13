import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeSandboxCommandMock } = vi.hoisted(() => ({
  executeSandboxCommandMock: vi.fn(),
}));

vi.mock("@edward/auth", () => ({
  getRunToolCallByIdempotencyKey: vi.fn(),
  upsertRunToolCall: vi.fn(),
}));

vi.mock("../../../services/sandbox/command.service.js", () => ({
  executeSandboxCommand: executeSandboxCommandMock,
}));

vi.mock("../../../services/websearch/tavily.search.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../services/websearch/tavily.search.js")
  >("../../../services/websearch/tavily.search.js");

  return {
    ...actual,
    searchTavilyBasic: vi.fn(),
  };
});

import {
  executeCommandTool,
  executeWebSearchTool,
} from "../../../services/tools/toolGateway.service.js";

describe("toolGateway command output sanitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached command output only when it passes runtime validation", async () => {
    const { getRunToolCallByIdempotencyKey } = await import("@edward/auth");
    vi.mocked(getRunToolCallByIdempotencyKey).mockResolvedValue({
      status: "succeeded",
      output: {
        exitCode: 0,
        stdout: "cached stdout",
        stderr: "cached stderr",
      },
    } as Awaited<ReturnType<typeof getRunToolCallByIdempotencyKey>>);

    const result = await executeCommandTool({
      runId: "run-1",
      turn: 1,
      sandboxId: "sb-1",
      command: "pnpm",
      args: ["build"],
    });

    expect(result).toEqual({
      exitCode: 0,
      stdout: "cached stdout",
      stderr: "cached stderr",
    });
    expect(executeSandboxCommandMock).not.toHaveBeenCalled();
  });

  it("falls back to live execution when cached command output is invalid", async () => {
    const { getRunToolCallByIdempotencyKey } = await import("@edward/auth");
    vi.mocked(getRunToolCallByIdempotencyKey).mockResolvedValue({
      status: "succeeded",
      output: {
        exitCode: 0,
        stdout: 42,
        stderr: "cached stderr",
      },
    } as Awaited<ReturnType<typeof getRunToolCallByIdempotencyKey>>);
    executeSandboxCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout: "fresh stdout",
      stderr: "fresh stderr",
    });

    const result = await executeCommandTool({
      runId: "run-1",
      turn: 1,
      sandboxId: "sb-1",
      command: "pnpm",
      args: ["build"],
    });

    expect(result).toEqual({
      exitCode: 0,
      stdout: "fresh stdout",
      stderr: "fresh stderr",
    });
    expect(executeSandboxCommandMock).toHaveBeenCalledOnce();
  });

  it("strips ANSI escape sequences without dropping mirrored stdout/stderr", async () => {
    const noisyOutput = [
      "\u001b[31m./src/store/useCart.ts:4:1\u001b[39m",
      "Export default doesn't exist in target module",
      "^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^",
      "^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^",
      "^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^",
      "^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^",
    ].join("\n");

    executeSandboxCommandMock.mockResolvedValue({
      exitCode: 1,
      stdout: noisyOutput,
      stderr: noisyOutput,
    });

    const result = await executeCommandTool({
      turn: 1,
      sandboxId: "sb-1",
      command: "pnpm",
      args: ["build"],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("./src/store/useCart.ts:4:1");
    expect(result.stdout).toContain("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^");
    expect(result.stderr).toContain("./src/store/useCart.ts:4:1");
    expect(result.stderr).not.toContain("\u001b[");
    expect(result.stderr).toContain("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^");
  });

  it("keeps mirrored output on both streams for successful commands", async () => {
    const mirroredOutput = "\u001b[32mBuild completed successfully\u001b[39m";

    executeSandboxCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout: mirroredOutput,
      stderr: mirroredOutput,
    });

    const result = await executeCommandTool({
      turn: 1,
      sandboxId: "sb-1",
      command: "pnpm",
      args: ["build"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("Build completed successfully");
    expect(result.stderr).toBe("Build completed successfully");
  });

  it("preserves raw output for file-read commands", async () => {
    const rawOutput = "same line\nsame line\nsame line\nsame line\n";

    executeSandboxCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout: rawOutput,
      stderr: "",
    });

    const result = await executeCommandTool({
      turn: 1,
      sandboxId: "sb-1",
      command: "cat",
      args: ["README.md"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(rawOutput);
    expect(result.stdout).not.toContain("...[line repeated");
    expect(result.stdout).not.toContain("...[truncated]");
    expect(result.stderr).toBe("");
  });

  it("returns very large command output in full", async () => {
    const longOutput = Array.from(
      { length: 800 },
      (_, index) => `line-${index}-${"x".repeat(20)}`,
    ).join("\n");

    executeSandboxCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout: longOutput,
      stderr: "",
    });

    const result = await executeCommandTool({
      turn: 1,
      sandboxId: "sb-1",
      command: "pnpm",
      args: ["build"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(longOutput);
    expect(result.stderr).toBe("");
  });

  it("returns large raw-output commands in full", async () => {
    const stdout = "a".repeat(64_500);
    executeSandboxCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout,
      stderr: "",
    });

    const result = await executeCommandTool({
      turn: 1,
      sandboxId: "sb-1",
      command: "grep",
      args: ["pattern", "file.txt"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(stdout);
    expect(result.stderr).toBe("");
  });

  it("does not truncate cat output at any prior sanitized-command limit", async () => {
    const stdout = "x".repeat(6_250);
    executeSandboxCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout,
      stderr: "",
    });

    const result = await executeCommandTool({
      turn: 1,
      sandboxId: "sb-1",
      command: "cat",
      args: ["README.md"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(stdout);
    expect(result.stdout).not.toContain("...[truncated]");
  });

  it("preserves repeated lines instead of collapsing them", async () => {
    const repeatedLineCount = 60_000;
    const oversized = `${"duplicate-line\n".repeat(repeatedLineCount)}`;

    executeSandboxCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout: oversized,
      stderr: "",
    });

    const result = await executeCommandTool({
      turn: 1,
      sandboxId: "sb-1",
      command: "pnpm",
      args: ["build"],
    });

    expect(result.stdout).toBe(oversized);
    expect(result.stdout.match(/duplicate-line/g)?.length).toBe(
      repeatedLineCount,
    );
  });

  it("truncates long web search answers while preserving mapped snippets", async () => {
    const { searchTavilyBasic } =
      await import("../../../services/websearch/tavily.search.js");
    const answer = "answer ".repeat(400);
    const snippet = "snippet ".repeat(300);

    vi.mocked(searchTavilyBasic).mockResolvedValue({
      query: "latest docs",
      answer,
      results: [
        {
          title: "Docs",
          url: "https://example.com/docs",
          snippet,
        },
      ],
    });

    const result = await executeWebSearchTool({
      turn: 1,
      query: "latest docs",
      maxResults: 5,
    });

    expect(result.answer).toBeDefined();
    expect(result.answer!.length).toBeLessThanOrEqual(320);
    expect(result.answer).toMatch(/\.\.\.$/);
    expect(result.results[0]?.snippet).toBe(snippet);
  });
});

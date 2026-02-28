import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TOOL_STDIO_CHARS } from "../../../utils/constants.js";

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

vi.mock("../../../services/websearch/tavily.search.js", () => ({
  searchTavilyBasic: vi.fn(),
}));

import { executeCommandTool } from "../../../services/tools/toolGateway.service.js";

describe("toolGateway command output sanitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("strips ANSI escape sequences and deduplicates mirrored stdout/stderr", async () => {
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
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("./src/store/useCart.ts:4:1");
    expect(result.stderr).not.toContain("\u001b[");
    expect(result.stderr).toContain("...[line repeated 1 more times]");
  });

  it("keeps mirrored output on stdout for successful commands", async () => {
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
    expect(result.stderr).toBe("");
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

  it("bounds very large sanitized outputs with truncation markers", async () => {
    const longOutput = Array.from({ length: 800 }, (_, index) =>
      `line-${index}-${"x".repeat(20)}`,
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
    expect(result.stdout).toContain("...[truncated]");
    expect(result.stdout.length).toBeLessThanOrEqual(MAX_TOOL_STDIO_CHARS + 20);
    expect(result.stderr).toBe("");
  });

  it("bounds raw-output commands with truncation markers", async () => {
    executeSandboxCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout: "a".repeat(MAX_TOOL_STDIO_CHARS + 500),
      stderr: "",
    });

    const result = await executeCommandTool({
      turn: 1,
      sandboxId: "sb-1",
      command: "cat",
      args: ["README.md"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("...[truncated]");
    expect(result.stdout.length).toBeLessThanOrEqual(MAX_TOOL_STDIO_CHARS + 20);
    expect(result.stderr).toBe("");
  });
});

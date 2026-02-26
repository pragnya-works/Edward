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
});

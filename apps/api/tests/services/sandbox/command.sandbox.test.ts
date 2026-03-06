import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeSandboxCommand } from "../../../services/sandbox/command.service.js";
import * as stateSandbox from "../../../services/sandbox/state.service.js";
import * as dockerSandbox from "../../../services/sandbox/sandbox-runtime.service.js";
import { CONTAINER_WORKDIR } from "../../../services/sandbox/sandbox-runtime.service.js";

import type { SandboxInstance } from "../../../services/sandbox/types.service.js";

vi.mock("../../../services/sandbox/state.service.js");
vi.mock("../../../services/sandbox/sandbox-runtime.service.js");
vi.mock("../../../utils/logger.js", () => {
  const mockedLogger = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    Environment: {
      Development: "development",
      Production: "production",
      Test: "test",
    },
    logger: mockedLogger,
    createLogger: vi.fn(() => mockedLogger),
  };
});

describe("executeSandboxCommand", () => {
  const sandboxId = "test-sandbox";
  const containerId = "test-container";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stateSandbox.getSandboxState).mockResolvedValue({
      id: sandboxId,
      containerId,
      userId: "user-1",
      chatId: "chat-1",
      expiresAt: Date.now() + 3600_000,
    } satisfies Omit<
      SandboxInstance,
      "scaffoldedFramework" | "requestedPackages"
    > as SandboxInstance);

    vi.mocked(dockerSandbox.getContainer).mockReturnValue({
      id: containerId,
      exec: vi.fn(),
    } as unknown as ReturnType<typeof dockerSandbox.getContainer>);
  });

  it("should allow whitelisted commands", async () => {
    vi.mocked(dockerSandbox.execCommand).mockResolvedValue({
      exitCode: 0,
      stdout: "file1.ts\nfile2.ts",
      stderr: "",
    });

    const result = await executeSandboxCommand(sandboxId, {
      command: "ls",
      args: ["-la"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("file1.ts");
    expect(dockerSandbox.execCommand).toHaveBeenCalledWith(
      expect.anything(),
      ["ls", "-la"],
      false,
      expect.any(Number),
      "node",
      expect.any(String),
    );
  });

  it("should throw error for non-whitelisted commands", async () => {
    await expect(
      executeSandboxCommand(sandboxId, {
        command: "rmdoor",
        args: ["-rf", "/"],
      }),
    ).rejects.toThrow(/is not allowed/);
  });

  it("should reject disallowed mutating commands (root deletion attempt)", async () => {
    await expect(
      executeSandboxCommand(sandboxId, { command: "rm", args: ["-rf", "/"] }),
    ).rejects.toThrow(/disallowed patterns/);
  });

  it("should block paths outside allowed directory", async () => {
    await expect(
      executeSandboxCommand(sandboxId, { command: "ls", args: ["../../etc"] }),
    ).rejects.toThrow(/Path outside allowed directory/);
  });

  it("should block sibling path prefixes that only start with workdir text", async () => {
    await expect(
      executeSandboxCommand(sandboxId, {
        command: "ls",
        args: ["../edward2/secrets.txt"],
      }),
    ).rejects.toThrow(/Path outside allowed directory/);
  });

  it("should block absolute paths outside workspace", async () => {
    await expect(
      executeSandboxCommand(sandboxId, {
        command: "cat",
        args: ["/etc/passwd"],
      }),
    ).rejects.toThrow(/Path outside allowed directory/);
  });

  it("should allow paths within the sandbox workdir", async () => {
    vi.mocked(dockerSandbox.execCommand).mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });

    await expect(
      executeSandboxCommand(sandboxId, {
        command: "ls",
        args: [CONTAINER_WORKDIR],
      }),
    ).resolves.toBeDefined();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const refs = vi.hoisted(() => ({
  sandboxGet: vi.fn(),
  sandboxList: vi.fn(),
  sandboxCreate: vi.fn(),
  runCommand: vi.fn(),
}));

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    get: refs.sandboxGet,
    list: refs.sandboxList,
    create: refs.sandboxCreate,
  },
}));

describe("sandbox runtime execCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refs.runCommand.mockReset();
    refs.sandboxGet.mockResolvedValue({
      status: "running",
      runCommand: refs.runCommand,
    });
  });

  it("waits for buffered stdout to flush before returning", async () => {
    refs.runCommand.mockImplementation(async ({ stdout }) => {
      stdout.cork();
      stdout.write('{"name":"demo"}');
      setTimeout(() => {
        stdout.uncork();
      }, 0);
      return { exitCode: 0 };
    });

    const { execCommand, getContainer } = await import(
      "../../../services/sandbox/sandbox-runtime.service.js"
    );

    const result = await execCommand(
      getContainer("sandbox-1"),
      ["cat", "package.json"],
      false,
      5_000,
    );

    expect(result.stdout).toBe('{"name":"demo"}');
    expect(result.stderr).toBe("");
  });
});

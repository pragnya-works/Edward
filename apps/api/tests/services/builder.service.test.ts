import { beforeEach, describe, expect, it, vi } from "vitest";

const refs = vi.hoisted(() => ({
  getContainer: vi.fn(() => ({ id: "container-1" })),
  execCommand: vi.fn(),
  readFileContent: vi.fn(),
  detectBuildOutput: vi.fn(),
  injectBasePathConfigs: vi.fn(),
  calculateBasePath: vi.fn(() => ""),
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../services/sandbox/sandbox-runtime.service.js", () => ({
  getContainer: refs.getContainer,
  execCommand: refs.execCommand,
  readFileContent: refs.readFileContent,
  CONTAINER_WORKDIR: "/vercel/sandbox/edward",
}));

vi.mock("../../services/sandbox/builder/output.detector.js", () => ({
  detectBuildOutput: refs.detectBuildOutput,
}));

vi.mock("../../services/sandbox/builder/basePathInjector.js", () => ({
  injectBasePathConfigs: refs.injectBasePathConfigs,
  calculateBasePath: refs.calculateBasePath,
}));

vi.mock("../../utils/logger.js", () => ({
  logger: refs.logger,
}));

vi.mock("../../app.config.js", () => ({
  config: {
    vercel: {
      runtime: "node22",
    },
  },
}));

describe("runUnifiedBuild", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refs.readFileContent.mockImplementation(async (_container, filePath: string) => {
      if (filePath === "package.json") {
        return JSON.stringify({
          scripts: { build: "vite build" },
          devDependencies: { vite: "^5.4.21" },
        });
      }

      if (filePath === ".edward/node-version") {
        return "22.22.0\n";
      }

      return null;
    });
    refs.detectBuildOutput.mockResolvedValue({ directory: "dist", type: "static" });
  });

  it("falls back to file-based Node.js version detection when stdout is empty", async () => {
    refs.execCommand.mockImplementation(async (_container, cmd: string[]) => {
      if (cmd[0] === "node") {
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      if (cmd[0] === "sh" && cmd[2]?.includes(".edward/node-version")) {
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      if (cmd[0] === "pnpm" && cmd[1] === "run" && cmd[2] === "build") {
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      throw new Error(`Unexpected command: ${cmd.join(" ")}`);
    });

    const { runUnifiedBuild } = await import("../../services/builder.service.js");
    const result = await runUnifiedBuild("container-1", "sandbox-1", {
      userId: "user-1",
      chatId: "chat-1",
      framework: "vite-react",
    });

    expect(result.success).toBe(true);
    expect(refs.execCommand).toHaveBeenCalledWith(
      expect.anything(),
      ["pnpm", "run", "build"],
      false,
      expect.any(Number),
      undefined,
      "/vercel/sandbox/edward",
      expect.any(Array),
    );
  });
});

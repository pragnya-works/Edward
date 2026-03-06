import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeAndInstallDependencies } from "../../../../services/sandbox/templates/dependency.merger.js";
import * as dockerSandbox from "../../../../services/sandbox/sandbox-runtime.service.js";
import * as sandboxState from "../../../../services/sandbox/state.service.js";

vi.mock("../../../../services/sandbox/sandbox-runtime.service.js");
vi.mock("../../../../services/sandbox/state.service.js");
vi.mock("../../../../utils/logger.js", () => ({
  Environment: {
    Development: "development",
    Production: "production",
    Test: "test",
  },
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
  createLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  })),
}));

describe("mergeAndInstallDependencies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sandboxState.getSandboxState).mockResolvedValue({
      id: "sb-1",
      containerId: "container-1",
      userId: "u-1",
      chatId: "c-1",
      expiresAt: Date.now() + 60_000,
      scaffoldedFramework: "vanilla",
    });
    vi.mocked(dockerSandbox.getContainer).mockReturnValue(
      {} as ReturnType<typeof dockerSandbox.getContainer>,
    );
  });

  it("does not reinstall packages that already exist in package.json", async () => {
    vi.mocked(dockerSandbox.readFileContent).mockResolvedValue(
      JSON.stringify({
        name: "demo",
        version: "1.0.0",
        dependencies: {
          react: "^18.2.0",
          zod: "^3.0.0",
        },
      }),
    );

    const result = await mergeAndInstallDependencies(
      "container-1",
      ["react", "zod"],
      "sb-1",
    );

    expect(result.success).toBe(true);
    expect(dockerSandbox.readFileContent).toHaveBeenCalledTimes(1);
    expect(dockerSandbox.readFileContent).toHaveBeenCalledWith(
      expect.anything(),
      "package.json",
      dockerSandbox.CONTAINER_WORKDIR,
    );
  });

  it("treats versioned package specs as already installed when package name exists", async () => {
    vi.mocked(dockerSandbox.readFileContent).mockResolvedValue(
      JSON.stringify({
        name: "demo",
        version: "1.0.0",
        dependencies: {
          zod: "^3.0.0",
        },
      }),
    );

    const result = await mergeAndInstallDependencies(
      "container-1",
      ["zod@^3.26.0"],
      "sb-1",
    );

    expect(result.success).toBe(true);
    expect(dockerSandbox.readFileContent).toHaveBeenCalledTimes(1);
  });

  it("installs only missing packages", async () => {
    let packageJsonReads = 0;

    vi.mocked(dockerSandbox.readFileContent).mockImplementation(async () => {
      packageJsonReads += 1;
      if (packageJsonReads === 1) {
        return JSON.stringify({
          name: "demo",
          version: "1.0.0",
          dependencies: {
            react: "^18.2.0",
          },
        });
      }

      return JSON.stringify({
        name: "demo",
        version: "1.0.0",
        dependencies: {
          react: "^18.2.0",
          zod: "^3.0.0",
        },
      });
    });

    vi.mocked(dockerSandbox.execCommand).mockImplementation(async (_container, cmd) => {
      if (cmd[0] === "pnpm" && cmd[1] === "add") {
        expect(cmd).toEqual(["pnpm", "add", "zod"]);
        return { exitCode: 0, stdout: "ok", stderr: "" };
      }

      throw new Error(`Unexpected command: ${cmd.join(" ")}`);
    });

    const result = await mergeAndInstallDependencies(
      "container-1",
      ["react", "zod"],
      "sb-1",
    );

    expect(result.success).toBe(true);
    expect(dockerSandbox.readFileContent).toHaveBeenCalledTimes(2);
    expect(dockerSandbox.execCommand).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      ["pnpm", "add", "zod"],
      false,
      expect.any(Number),
      undefined,
      dockerSandbox.CONTAINER_WORKDIR,
      [
        "NEXT_TELEMETRY_DISABLED=1",
        "CI=true",
        "NPM_CONFIG_ENGINE_STRICT=true",
      ],
    );
  });

  it("falls back to install flow when package.json is malformed", async () => {
    vi.mocked(dockerSandbox.readFileContent).mockResolvedValue(
      JSON.stringify({
        name: ["bad-shape"],
        version: "1.0.0",
        dependencies: [],
      }),
    );

    vi.mocked(dockerSandbox.execCommand).mockResolvedValue({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    });

    const result = await mergeAndInstallDependencies(
      "container-1",
      ["zod"],
      "sb-1",
    );

    expect(result.success).toBe(true);
    expect(dockerSandbox.execCommand).toHaveBeenCalledWith(
      expect.anything(),
      ["pnpm", "add", "zod"],
      false,
      expect.any(Number),
      undefined,
      dockerSandbox.CONTAINER_WORKDIR,
      [
        "NEXT_TELEMETRY_DISABLED=1",
        "CI=true",
        "NPM_CONFIG_ENGINE_STRICT=true",
      ],
    );
  });
});

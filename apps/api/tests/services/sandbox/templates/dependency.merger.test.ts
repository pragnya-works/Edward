import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeAndInstallDependencies } from "../../../../services/sandbox/templates/dependency.merger.js";
import * as dockerSandbox from "../../../../services/sandbox/docker.sandbox.js";
import * as sandboxState from "../../../../services/sandbox/state.sandbox.js";

vi.mock("../../../../services/sandbox/docker.sandbox.js");
vi.mock("../../../../services/sandbox/state.sandbox.js");
vi.mock("../../../../utils/logger.js", () => ({
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
    vi.mocked(dockerSandbox.execCommand).mockImplementation(
      async (_container, cmd) => {
        if (cmd[0] === "cat" && cmd[1] === "package.json") {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              name: "demo",
              version: "1.0.0",
              dependencies: {
                react: "^18.2.0",
                zod: "^3.0.0",
              },
            }),
            stderr: "",
          };
        }

        throw new Error(`Unexpected command: ${cmd.join(" ")}`);
      },
    );

    const result = await mergeAndInstallDependencies(
      "container-1",
      ["react", "zod"],
      "sb-1",
    );

    expect(result.success).toBe(true);
    expect(dockerSandbox.execCommand).toHaveBeenCalledTimes(1);
    expect(dockerSandbox.execCommand).toHaveBeenCalledWith(
      expect.anything(),
      ["cat", "package.json"],
      false,
      5000,
      undefined,
      dockerSandbox.CONTAINER_WORKDIR,
    );
  });

  it("installs only missing packages", async () => {
    let packageJsonReads = 0;

    vi.mocked(dockerSandbox.execCommand).mockImplementation(
      async (_container, cmd) => {
        if (cmd[0] === "cat" && cmd[1] === "package.json") {
          packageJsonReads += 1;
          if (packageJsonReads === 1) {
            return {
              exitCode: 0,
              stdout: JSON.stringify({
                name: "demo",
                version: "1.0.0",
                dependencies: {
                  react: "^18.2.0",
                },
              }),
              stderr: "",
            };
          }

          return {
            exitCode: 0,
            stdout: JSON.stringify({
              name: "demo",
              version: "1.0.0",
              dependencies: {
                react: "^18.2.0",
                zod: "^3.0.0",
              },
            }),
            stderr: "",
          };
        }

        if (cmd[0] === "pnpm" && cmd[1] === "add") {
          expect(cmd).toEqual(["pnpm", "add", "zod"]);
          return { exitCode: 0, stdout: "ok", stderr: "" };
        }

        throw new Error(`Unexpected command: ${cmd.join(" ")}`);
      },
    );

    const result = await mergeAndInstallDependencies(
      "container-1",
      ["react", "zod"],
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
      ["NEXT_TELEMETRY_DISABLED=1", "CI=true"],
    );
  });
});

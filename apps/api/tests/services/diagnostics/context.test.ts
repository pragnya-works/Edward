import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getContainer: vi.fn(() => ({ id: "container-1" })),
  execCommand: vi.fn(),
  logger: {
    debug: vi.fn(),
  },
}));

vi.mock("../../../services/sandbox/docker.service.js", () => ({
  getContainer: mocks.getContainer,
  execCommand: mocks.execCommand,
  CONTAINER_WORKDIR: "/workspace",
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: mocks.logger,
}));

describe("diagnostics context helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execCommand.mockReset();
  });

  it("reads and caches file content from the sandbox container", async () => {
    const { readFileWithCache } = await import("../../../services/diagnostics/context.js");
    const cache = new Map();

    mocks.execCommand.mockResolvedValueOnce({
      exitCode: 0,
      stdout: "export const value = 1;",
      stderr: "",
    });

    const first = await readFileWithCache("sandbox-1", "src/index.ts", cache);
    const second = await readFileWithCache("sandbox-1", "src/index.ts", cache);

    expect(first).toBe("export const value = 1;");
    expect(second).toBe("export const value = 1;");
    expect(mocks.execCommand).toHaveBeenCalledTimes(1);
    expect(cache.get("src/index.ts")?.content).toBe("export const value = 1;");
  });

  it("returns empty content and logs debug when reads fail", async () => {
    const { readFileWithCache } = await import("../../../services/diagnostics/context.js");

    mocks.execCommand.mockRejectedValueOnce(new Error("docker unavailable"));
    const content = await readFileWithCache("sandbox-2", "src/missing.ts", new Map());

    expect(content).toBe("");
    expect(mocks.logger.debug).toHaveBeenCalled();
  });

  it("formats snippets with line markers around the failing line", async () => {
    const { readFileSnippet } = await import("../../../services/diagnostics/context.js");

    const snippet = await readFileSnippet(
      ["line1", "line2", "line3", "line4"].join("\n"),
      3,
      1,
    );

    expect(snippet).toContain("  2 | line2");
    expect(snippet).toContain(">   3 | line3");
    expect(snippet).toContain("  4 | line4");
  });

  it("extracts import chains and related files from project content", async () => {
    const {
      extractImportChain,
      findRelatedFiles,
    } = await import("../../../services/diagnostics/context.js");

    const cache = new Map<string, { content: string; timestamp: number }>([
      [
        "src/index.ts",
        {
          content: [
            "import helper from './helper';",
            "import { useThing } from 'left-pad';",
            "console.log(useThing);",
          ].join("\n"),
          timestamp: Date.now(),
        },
      ],
      [
        "src/helper.ts",
        {
          content: "export default 1;",
          timestamp: Date.now(),
        },
      ],
      [
        "src/uses-target.ts",
        {
          content: "import { useThing } from 'left-pad';",
          timestamp: Date.now(),
        },
      ],
      [
        "src/another.ts",
        {
          content: "const x = 'left-pad';",
          timestamp: Date.now(),
        },
      ],
    ]);

    mocks.execCommand
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "src/uses-target.ts\nsrc/another.ts\n",
        stderr: "",
      });

    const chain = await extractImportChain("sandbox-3", "src/index.ts", "helper", cache);
    const related = await findRelatedFiles(
      "sandbox-3",
      "left-pad",
      "src/index.ts",
      cache,
    );

    expect(chain[0]).toMatchObject({
      file: "src/index.ts",
      importPath: "./helper",
      line: 1,
    });
    expect(related).toHaveLength(2);
    expect(related[0]?.reason).toContain("left-pad");
  });

  it("loads and parses package and tsconfig metadata", async () => {
    const { loadProjectContext } = await import("../../../services/diagnostics/context.js");

    mocks.execCommand
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({ name: "test-project" }),
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({ compilerOptions: { strict: true } }),
        stderr: "",
      });

    const context = await loadProjectContext("sandbox-4", new Map());

    expect(context.packageJson).toEqual({ name: "test-project" });
    expect(context.tsConfig).toEqual({ compilerOptions: { strict: true } });
  });
});

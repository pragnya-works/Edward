import { beforeEach, describe, expect, it, vi } from "vitest";
import { ParserEventType } from "../../../schemas/chat.schema.js";
import type { WorkflowState } from "../../../services/planning/schemas.js";

const ensureSandboxMock = vi.fn();
const executeInstallPhaseMock = vi.fn();

vi.mock("../../../services/planning/workflowEngine.js", async () => {
  const actual = await vi.importActual(
    "../../../services/planning/workflowEngine.js",
  );

  return {
    ...actual,
    ensureSandbox: ensureSandboxMock,
    executeInstallPhase: executeInstallPhaseMock,
  };
});

vi.mock("../../../services/sandbox/writes.sandbox.js", () => ({
  prepareSandboxFile: vi.fn(),
  flushSandbox: vi.fn(),
  sanitizeSandboxFile: vi.fn(),
}));

vi.mock("../../../services/sandbox/lifecycle/packages.js", () => ({
  addSandboxPackages: vi.fn(),
}));

vi.mock("../../../services/planning/resolvers/dependency.resolver.js", () => ({
  resolveDependencies: vi.fn(async () => ({ resolved: [], failed: [] })),
  suggestAlternatives: vi.fn(() => []),
}));

vi.mock("../../../services/tools/toolGateway.service.js", () => ({
  executeCommandTool: vi.fn(),
  executeWebSearchTool: vi.fn(),
}));

describe("event handlers sandbox gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureSandboxMock.mockImplementation(async (workflow: WorkflowState) => {
      workflow.sandboxId = "sb-1";
      return "sb-1";
    });
    executeInstallPhaseMock.mockResolvedValue({
      step: "INSTALL_PACKAGES",
      success: true,
      durationMs: 1,
      retryCount: 0,
    });
  });

  function createCtx() {
    const workflow = {
      id: "wf-1",
      userId: "u-1",
      chatId: "c-1",
      context: { errors: [] },
      history: [],
      status: "pending",
      currentStep: "analyze",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as unknown as WorkflowState;

    return {
      workflow,
      res: {} as never,
      decryptedApiKey: "k",
      userId: "u-1",
      chatId: "c-1",
      isFollowUp: false,
      sandboxTagDetected: false,
      currentFilePath: undefined,
      isFirstFileChunk: true,
      generatedFiles: new Map<string, string>(),
      declaredPackages: [],
      toolResultsThisTurn: [],
    };
  }

  it("provisions sandbox for install even before sandbox tag", async () => {
    const { resolveDependencies } = await import(
      "../../../services/planning/resolvers/dependency.resolver.js"
    );
    vi.mocked(resolveDependencies).mockResolvedValueOnce({
      resolved: [{ name: "react", version: "18.2.0", valid: true }],
      failed: [],
      warnings: [],
    });

    const { handleParserEvent } = await import(
      "../../../controllers/chat/event.handlers.js"
    );
    const ctx = createCtx();

    await handleParserEvent(ctx, {
      type: ParserEventType.INSTALL_CONTENT,
      dependencies: ["react"],
      framework: "react",
    });

    expect(ensureSandboxMock).toHaveBeenCalledTimes(1);
    expect(executeInstallPhaseMock).toHaveBeenCalledTimes(1);
  });

  it("provisions sandbox only when sandbox tag is detected", async () => {
    const { handleParserEvent } = await import(
      "../../../controllers/chat/event.handlers.js"
    );
    const ctx = createCtx();

    const result = await handleParserEvent(ctx, {
      type: ParserEventType.SANDBOX_START,
      project: "demo",
      base: "vite",
    });

    expect(ensureSandboxMock).toHaveBeenCalledTimes(1);
    expect(result.sandboxTagDetected).toBe(true);
  });

  it("executes web search event and stores tool results", async () => {
    const { executeWebSearchTool } = await import(
      "../../../services/tools/toolGateway.service.js"
    );
    vi.mocked(executeWebSearchTool).mockResolvedValueOnce({
      query: "latest next.js version",
      answer: "Use the latest stable release.",
      results: [
        {
          title: "Next.js Releases",
          url: "https://github.com/vercel/next.js/releases",
          snippet: "Release notes...",
        },
      ],
    });

    const { handleParserEvent } = await import(
      "../../../controllers/chat/event.handlers.js"
    );
    const ctx = createCtx();

    const result = await handleParserEvent(ctx, {
      type: ParserEventType.WEB_SEARCH,
      query: "latest next.js version",
      maxResults: 3,
    });

    expect(result.handled).toBe(true);
    expect(ctx.toolResultsThisTurn).toHaveLength(1);
    expect(ctx.toolResultsThisTurn[0]).toMatchObject({
      tool: "web_search",
      query: "latest next.js version",
    });
  });
});

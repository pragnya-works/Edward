import { beforeEach, describe, expect, it, vi } from "vitest";
import { ParserEventType } from "../../../schemas/chat.schema.js";
import type { WorkflowState } from "../../../services/planning/schemas.js";

const ensureSandboxMock = vi.fn();

vi.mock("../../../services/planning/workflowEngine.js", async () => {
  const actual = await vi.importActual(
    "../../../services/planning/workflowEngine.js",
  );

  return {
    ...actual,
    ensureSandbox: ensureSandboxMock,
    advanceWorkflow: vi.fn(),
  };
});

vi.mock("../../../services/sandbox/writes.sandbox.js", () => ({
  prepareSandboxFile: vi.fn(),
  flushSandbox: vi.fn(),
  sanitizeSandboxFile: vi.fn(),
}));

vi.mock("../../../services/sandbox/command.sandbox.js", () => ({
  executeSandboxCommand: vi.fn(),
}));

vi.mock("../../../services/sandbox/lifecycle/packages.js", () => ({
  addSandboxPackages: vi.fn(),
}));

vi.mock("../../../services/planning/resolvers/dependency.resolver.js", () => ({
  resolveDependencies: vi.fn(async () => ({ resolved: [], failed: [] })),
  suggestAlternatives: vi.fn(() => []),
}));

vi.mock("../../../services/websearch/tavily.search.js", () => ({
  searchTavilyBasic: vi.fn(),
}));

describe("event handlers sandbox gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureSandboxMock.mockResolvedValue("sb-1");
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

  it("does not provision sandbox for install without sandbox tag", async () => {
    const { handleParserEvent } = await import(
      "../../../controllers/chat/event.handlers.js"
    );
    const ctx = createCtx();

    await handleParserEvent(ctx, {
      type: ParserEventType.INSTALL_CONTENT,
      dependencies: ["react"],
      framework: "react",
    });

    expect(ensureSandboxMock).not.toHaveBeenCalled();
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
    const { searchTavilyBasic } = await import(
      "../../../services/websearch/tavily.search.js"
    );
    vi.mocked(searchTavilyBasic).mockResolvedValueOnce({
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

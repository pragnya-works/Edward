import { beforeEach, describe, expect, it, vi } from "vitest";
import { ParserEventType } from "../../../schemas/chat.schema.js";
import type { WorkflowState } from "../../../services/planning/schemas.js";
import type { EventHandlerContext } from "../../../controllers/chat/event.handlers.js";

const ensureSandboxMock = vi.fn();
const executeInstallPhaseMock = vi.fn();
const sendSSEEventMock = vi.fn();
const sendSSEErrorMock = vi.fn();

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

vi.mock("../../../controllers/chat/sse.utils.js", () => ({
  sendSSEEvent: sendSSEEventMock,
  sendSSEError: sendSSEErrorMock,
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

  function createCtx(): EventHandlerContext {
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
      res: {
        writable: false,
        writableEnded: false,
      } as never,
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

  function createInstallQueue() {
    let tail = Promise.resolve();
    return {
      enqueue(task: () => Promise<void>) {
        const queued = tail.then(task, task);
        tail = queued.catch(() => undefined);
      },
      async waitForIdle() {
        await tail;
      },
    };
  }

  function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
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

  it("queues install work without blocking parser event handling", async () => {
    const { resolveDependencies } = await import(
      "../../../services/planning/resolvers/dependency.resolver.js"
    );
    vi.mocked(resolveDependencies).mockResolvedValueOnce({
      resolved: [{ name: "react", version: "18.2.0", valid: true }],
      failed: [],
      warnings: [],
    });

    const pendingInstall = deferred<{
      step: string;
      success: boolean;
      durationMs: number;
      retryCount: number;
    }>();
    executeInstallPhaseMock.mockReturnValueOnce(pendingInstall.promise);

    const { handleParserEvent } = await import(
      "../../../controllers/chat/event.handlers.js"
    );
    const ctx = createCtx();
    const installTaskQueue = createInstallQueue();
    ctx.installTaskQueue = installTaskQueue;

    const result = await Promise.race([
      handleParserEvent(ctx, {
        type: ParserEventType.INSTALL_CONTENT,
        dependencies: ["react"],
        framework: "react",
      }).then(() => "resolved"),
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), 50),
      ),
    ]);

    expect(result).toBe("resolved");

    await Promise.resolve();
    expect(executeInstallPhaseMock).toHaveBeenCalledTimes(1);

    pendingInstall.resolve({
      step: "INSTALL_PACKAGES",
      success: true,
      durationMs: 1,
      retryCount: 0,
    });
    await installTaskQueue.waitForIdle();
  });

  it("waits for queued installs before running sandbox commands", async () => {
    const { resolveDependencies } = await import(
      "../../../services/planning/resolvers/dependency.resolver.js"
    );
    const { executeCommandTool } = await import(
      "../../../services/tools/toolGateway.service.js"
    );
    vi.mocked(resolveDependencies).mockResolvedValueOnce({
      resolved: [{ name: "react", version: "18.2.0", valid: true }],
      failed: [],
      warnings: [],
    });

    const pendingInstall = deferred<{
      step: string;
      success: boolean;
      durationMs: number;
      retryCount: number;
    }>();
    executeInstallPhaseMock.mockReturnValueOnce(pendingInstall.promise);
    vi.mocked(executeCommandTool).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    });

    const { handleParserEvent } = await import(
      "../../../controllers/chat/event.handlers.js"
    );
    const ctx = createCtx();
    ctx.sandboxTagDetected = true;
    const installTaskQueue = createInstallQueue();
    ctx.installTaskQueue = installTaskQueue;

    await handleParserEvent(ctx, {
      type: ParserEventType.INSTALL_CONTENT,
      dependencies: ["react"],
      framework: "react",
    });

    const commandPromise = handleParserEvent(ctx, {
      type: ParserEventType.COMMAND,
      command: "pwd",
      args: [],
    });

    await Promise.resolve();
    expect(executeCommandTool).not.toHaveBeenCalled();

    pendingInstall.resolve({
      step: "INSTALL_PACKAGES",
      success: true,
      durationMs: 1,
      retryCount: 0,
    });
    await installTaskQueue.waitForIdle();
    await commandPromise;

    expect(executeCommandTool).toHaveBeenCalledTimes(1);
  });

  it("emits INSTALL_END only after real install completion", async () => {
    const { resolveDependencies } = await import(
      "../../../services/planning/resolvers/dependency.resolver.js"
    );
    vi.mocked(resolveDependencies).mockResolvedValueOnce({
      resolved: [{ name: "react", version: "18.2.0", valid: true }],
      failed: [],
      warnings: [],
    });

    const pendingInstall = deferred<{
      step: string;
      success: boolean;
      durationMs: number;
      retryCount: number;
    }>();
    executeInstallPhaseMock.mockReturnValueOnce(pendingInstall.promise);

    const { handleParserEvent } = await import(
      "../../../controllers/chat/event.handlers.js"
    );
    const ctx = createCtx();
    const installTaskQueue = createInstallQueue();
    ctx.installTaskQueue = installTaskQueue;

    await handleParserEvent(ctx, {
      type: ParserEventType.INSTALL_CONTENT,
      dependencies: ["react"],
      framework: "react",
    });

    await Promise.resolve();

    expect(sendSSEEventMock).toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({
        type: ParserEventType.INSTALL_CONTENT,
        dependencies: ["react"],
      }),
    );

    expect(sendSSEEventMock).not.toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({
        type: ParserEventType.INSTALL_END,
      }),
    );

    pendingInstall.resolve({
      step: "INSTALL_PACKAGES",
      success: true,
      durationMs: 1,
      retryCount: 0,
    });
    await installTaskQueue.waitForIdle();

    expect(sendSSEEventMock).toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({
        type: ParserEventType.INSTALL_END,
      }),
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ParserEventType } from "@edward/shared/streamEvents";
import type { WorkflowState } from "../../../services/planning/schemas.js";
import type { EventHandlerContext } from "../../../services/chat/session/events/handler.js";

const ensureSandboxMock = vi.fn();
const executeInstallPhaseMock = vi.fn();
const sendSSEEventMock = vi.fn();
const sendSSEErrorMock = vi.fn();
const sendSSERecoverableErrorMock = vi.fn();
const getActiveSandboxMock = vi.fn();

vi.mock("../../../services/planning/workflow/steps/ensureSandbox.js", () => ({
  ensureSandbox: ensureSandboxMock,
}));

vi.mock("../../../services/planning/workflow/steps/executeInstallPhase.js", () => ({
  executeInstallPhase: executeInstallPhaseMock,
}));

vi.mock("../../../services/sandbox/write/buffer.js", () => ({
  prepareSandboxFile: vi.fn(),
  sanitizeSandboxFile: vi.fn(),
}));

vi.mock("../../../services/sandbox/write/flush.js", () => ({
  flushSandbox: vi.fn(),
}));

vi.mock("../../../services/sandbox/lifecycle/packages.js", () => ({
  addSandboxPackages: vi.fn(),
}));

vi.mock("../../../services/planning/resolvers/dependency.resolver.js", () => ({
  resolveDependencies: vi.fn(async () => ({ resolved: [], failed: [] })),
  suggestAlternatives: vi.fn(() => []),
}));

vi.mock("../../../services/sandbox/lifecycle/provisioning.js", () => ({
  getActiveSandbox: getActiveSandboxMock,
}));

vi.mock("../../../services/tools/toolGateway.service.js", () => ({
  executeCommandTool: vi.fn(),
  executeWebSearchTool: vi.fn(),
}));

vi.mock("../../../services/sse-utils/service.js", () => ({
  sendSSEEvent: sendSSEEventMock,
  sendSSEError: sendSSEErrorMock,
  sendSSERecoverableError: sendSSERecoverableErrorMock,
}));

describe("event handlers sandbox gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveSandboxMock.mockResolvedValue(undefined);
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
      "../../../services/chat/session/events/handler.js"
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
      "../../../services/chat/session/events/handler.js"
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
      "../../../services/chat/session/events/handler.js"
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
    expect(sendSSEEventMock).toHaveBeenNthCalledWith(
      1,
      ctx.res,
      expect.objectContaining({
        type: ParserEventType.WEB_SEARCH,
        query: "latest next.js version",
        maxResults: 3,
      }),
    );
    expect(sendSSEEventMock).toHaveBeenNthCalledWith(
      2,
      ctx.res,
      expect.objectContaining({
        type: ParserEventType.WEB_SEARCH,
        query: "latest next.js version",
        maxResults: 3,
        answer: "Use the latest stable release.",
      }),
    );
    expect(sendSSERecoverableErrorMock).not.toHaveBeenCalled();
  });

  it("emits pending and error web search events when the tool fails", async () => {
    const { executeWebSearchTool } = await import(
      "../../../services/tools/toolGateway.service.js"
    );
    vi.mocked(executeWebSearchTool).mockRejectedValueOnce(
      new Error("network down"),
    );

    const { handleParserEvent } = await import(
      "../../../services/chat/session/events/handler.js"
    );
    const ctx = createCtx();

    const result = await handleParserEvent(ctx, {
      type: ParserEventType.WEB_SEARCH,
      query: "react 19 release date",
      maxResults: 4,
    });

    expect(result.handled).toBe(true);
    expect(ctx.toolResultsThisTurn).toHaveLength(1);
    expect(ctx.toolResultsThisTurn[0]).toMatchObject({
      tool: "web_search",
      query: "react 19 release date",
      maxResults: 4,
      error: "network down",
    });
    expect(sendSSEEventMock).toHaveBeenNthCalledWith(
      1,
      ctx.res,
      expect.objectContaining({
        type: ParserEventType.WEB_SEARCH,
        query: "react 19 release date",
        maxResults: 4,
      }),
    );
    expect(sendSSEEventMock).toHaveBeenNthCalledWith(
      2,
      ctx.res,
      expect.objectContaining({
        type: ParserEventType.WEB_SEARCH,
        query: "react 19 release date",
        maxResults: 4,
        error: "network down",
      }),
    );
    expect(sendSSERecoverableErrorMock).toHaveBeenCalledWith(
      ctx.res,
      "Web search failed: network down",
      expect.objectContaining({
        code: "web_search_failed",
      }),
    );
  });

  it("rejects empty web search query without emitting search events", async () => {
    const { handleParserEvent } = await import(
      "../../../services/chat/session/events/handler.js"
    );
    const ctx = createCtx();

    const result = await handleParserEvent(ctx, {
      type: ParserEventType.WEB_SEARCH,
      query: "   ",
      maxResults: 4,
    });

    expect(result.handled).toBe(true);
    expect(ctx.toolResultsThisTurn).toHaveLength(0);
    expect(sendSSEEventMock).not.toHaveBeenCalled();
    expect(sendSSERecoverableErrorMock).toHaveBeenCalledWith(
      ctx.res,
      "Web search failed: empty query",
      expect.objectContaining({
        code: "web_search_failed",
      }),
    );
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
      "../../../services/chat/session/events/handler.js"
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

  it("runs command tool when a sandbox session already exists even without sandbox tag in this turn", async () => {
    const { executeCommandTool } = await import(
      "../../../services/tools/toolGateway.service.js"
    );
    vi.mocked(executeCommandTool).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "src\npackage.json",
      stderr: "",
    });

    const { handleParserEvent } = await import(
      "../../../services/chat/session/events/handler.js"
    );
    const ctx = createCtx();
    ctx.workflow.sandboxId = "sb-existing";
    ctx.sandboxTagDetected = false;
    getActiveSandboxMock.mockResolvedValueOnce("sb-existing");

    const result = await handleParserEvent(ctx, {
      type: ParserEventType.COMMAND,
      command: "ls",
      args: ["-la"],
    });

    expect(result.handled).toBe(true);
    expect(executeCommandTool).toHaveBeenCalledTimes(1);
    expect(executeCommandTool).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: "sb-existing",
        command: "ls",
        args: ["-la"],
      }),
    );
    expect(sendSSERecoverableErrorMock).not.toHaveBeenCalledWith(
      ctx.res,
      expect.stringContaining("Command skipped: no active sandbox session"),
      expect.anything(),
    );
    expect(getActiveSandboxMock).toHaveBeenCalledWith("c-1");
  });

  it("recovers active sandbox for command execution when workflow sandboxId is missing", async () => {
    const { executeCommandTool } = await import(
      "../../../services/tools/toolGateway.service.js"
    );
    vi.mocked(executeCommandTool).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    });
    getActiveSandboxMock.mockResolvedValueOnce("sb-recovered");

    const { handleParserEvent } = await import(
      "../../../services/chat/session/events/handler.js"
    );
    const ctx = createCtx();
    ctx.workflow.sandboxId = undefined;

    const result = await handleParserEvent(ctx, {
      type: ParserEventType.COMMAND,
      command: "cat",
      args: ["src/App.tsx"],
    });

    expect(result.handled).toBe(true);
    expect(getActiveSandboxMock).toHaveBeenCalledWith("c-1");
    expect(ctx.workflow.sandboxId).toBe("sb-recovered");
    expect(executeCommandTool).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: "sb-recovered",
        command: "cat",
        args: ["src/App.tsx"],
      }),
    );
  });

  it("falls back to provisioning when active sandbox lookup throws", async () => {
    const { executeCommandTool } = await import(
      "../../../services/tools/toolGateway.service.js"
    );
    vi.mocked(executeCommandTool).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    });
    getActiveSandboxMock.mockRejectedValueOnce(new Error("redis unavailable"));

    const { handleParserEvent } = await import(
      "../../../services/chat/session/events/handler.js"
    );
    const ctx = createCtx();
    ctx.workflow.sandboxId = undefined;

    const result = await handleParserEvent(ctx, {
      type: ParserEventType.COMMAND,
      command: "pwd",
      args: [],
    });

    expect(result.handled).toBe(true);
    expect(ensureSandboxMock).toHaveBeenCalledTimes(1);
    expect(executeCommandTool).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: "sb-1",
      }),
    );
  });

  it("reprovisions sandbox for command execution when existing sandbox id is stale", async () => {
    const { executeCommandTool } = await import(
      "../../../services/tools/toolGateway.service.js"
    );
    vi.mocked(executeCommandTool).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "stale recovered",
      stderr: "",
    });
    getActiveSandboxMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const { handleParserEvent } = await import(
      "../../../services/chat/session/events/handler.js"
    );
    const ctx = createCtx();
    ctx.workflow.sandboxId = "sb-stale";

    const result = await handleParserEvent(ctx, {
      type: ParserEventType.COMMAND,
      command: "pwd",
      args: [],
    });

    expect(result.handled).toBe(true);
    expect(ensureSandboxMock).toHaveBeenCalledTimes(1);
    expect(ctx.workflow.sandboxId).toBe("sb-1");
    expect(executeCommandTool).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: "sb-1",
      }),
    );
  });

  it("retries command after sandbox-not-found execution failure using recovered sandbox", async () => {
    const { executeCommandTool } = await import(
      "../../../services/tools/toolGateway.service.js"
    );
    vi.mocked(executeCommandTool)
      .mockRejectedValueOnce(new Error("Sandbox not found: sb-existing"))
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "retry-ok",
        stderr: "",
      });
    getActiveSandboxMock
      .mockResolvedValueOnce("sb-existing")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const { handleParserEvent } = await import(
      "../../../services/chat/session/events/handler.js"
    );
    const ctx = createCtx();
    ctx.workflow.sandboxId = "sb-existing";

    const result = await handleParserEvent(ctx, {
      type: ParserEventType.COMMAND,
      command: "ls",
      args: ["src"],
    });

    expect(result.handled).toBe(true);
    expect(ensureSandboxMock).toHaveBeenCalledTimes(1);
    expect(executeCommandTool).toHaveBeenCalledTimes(2);
    expect(executeCommandTool).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sandboxId: "sb-existing" }),
    );
    expect(executeCommandTool).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sandboxId: "sb-1" }),
    );
    expect(ctx.toolResultsThisTurn).toHaveLength(1);
    expect(ctx.toolResultsThisTurn[0]).toMatchObject({
      tool: "command",
      stdout: "retry-ok",
    });
  });

  it("does not retry command on unrelated 404-style errors", async () => {
    const { executeCommandTool } = await import(
      "../../../services/tools/toolGateway.service.js"
    );
    vi.mocked(executeCommandTool).mockRejectedValueOnce(
      new Error("HTTP 404 from package mirror"),
    );
    getActiveSandboxMock.mockResolvedValueOnce("sb-existing");

    const { handleParserEvent } = await import(
      "../../../services/chat/session/events/handler.js"
    );
    const ctx = createCtx();
    ctx.workflow.sandboxId = "sb-existing";

    const result = await handleParserEvent(ctx, {
      type: ParserEventType.COMMAND,
      command: "npm",
      args: ["view", "react", "version"],
    });

    expect(result.handled).toBe(true);
    expect(executeCommandTool).toHaveBeenCalledTimes(1);
    expect(sendSSERecoverableErrorMock).toHaveBeenCalledWith(
      ctx.res,
      expect.stringContaining("Command failed"),
      expect.objectContaining({
        code: "command_failed",
      }),
    );
  });

  it("skips command tool when no sandbox session exists", async () => {
    const { executeCommandTool } = await import(
      "../../../services/tools/toolGateway.service.js"
    );
    const { handleParserEvent } = await import(
      "../../../services/chat/session/events/handler.js"
    );
    const ctx = createCtx();
    ctx.workflow.sandboxId = undefined;
    ctx.sandboxTagDetected = false;
    ensureSandboxMock.mockRejectedValue(new Error("provision failed"));

    const result = await handleParserEvent(ctx, {
      type: ParserEventType.COMMAND,
      command: "ls",
      args: ["src"],
    });

    expect(result.handled).toBe(true);
    expect(executeCommandTool).not.toHaveBeenCalled();
    expect(ctx.toolResultsThisTurn).toHaveLength(1);
    expect(ctx.toolResultsThisTurn[0]).toMatchObject({
      tool: "command",
      command: "ls",
      args: ["src"],
      stderr: expect.stringContaining("no active sandbox session"),
    });
    expect(getActiveSandboxMock).toHaveBeenCalledWith("c-1");
    expect(ensureSandboxMock).toHaveBeenCalledTimes(1);
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
      "../../../services/chat/session/events/handler.js"
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
    expect(getActiveSandboxMock).not.toHaveBeenCalled();

    pendingInstall.resolve({
      step: "INSTALL_PACKAGES",
      success: true,
      durationMs: 1,
      retryCount: 0,
    });
    await installTaskQueue.waitForIdle();
    await commandPromise;

    expect(getActiveSandboxMock).toHaveBeenCalledWith("c-1");
    expect(executeCommandTool).toHaveBeenCalledTimes(1);
  });

  it("emits fatal sandbox execution errors for runtime sandbox failures", async () => {
    const bufferService = await import("../../../services/sandbox/write/buffer.js");
    vi.mocked(bufferService.prepareSandboxFile).mockRejectedValueOnce(
      new Error("disk unavailable"),
    );

    const { handleParserEvent } = await import(
      "../../../services/chat/session/events/handler.js"
    );
    const ctx = createCtx();
    ctx.workflow.sandboxId = "sb-1";
    ctx.sandboxTagDetected = true;

    const result = await handleParserEvent(ctx, {
      type: ParserEventType.FILE_START,
      path: "src/App.tsx",
    });

    expect(result.handled).toBe(true);
    expect(sendSSEErrorMock).toHaveBeenCalledWith(
      ctx.res,
      "Sandbox execution failed",
      expect.objectContaining({
        code: "sandbox_execution_failed",
      }),
    );
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
      "../../../services/chat/session/events/handler.js"
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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageRole } from "@edward/auth";
import { AgentLoopStopReason, ParserEventType } from "@edward/shared/streamEvents";

const mocks = vi.hoisted(() => ({
  streamResponseMock: vi.fn(),
  computeTokenUsageMock: vi.fn(),
  isOverContextLimitMock: vi.fn(),
  parserProcessMock: vi.fn(),
  parserFlushMock: vi.fn(),
  createTurnEventStateMock: vi.fn(),
  processParserEventsMock: vi.fn(),
  buildAgentContinuationPromptMock: vi.fn(),
  sendSSEErrorMock: vi.fn(),
  sendSSERecoverableErrorMock: vi.fn(),
}));

vi.mock("../../../lib/llm/provider.client.js", () => ({
  streamResponse: mocks.streamResponseMock,
}));

vi.mock("../../../lib/llm/tokens.js", () => ({
  computeTokenUsage: mocks.computeTokenUsageMock,
  isOverContextLimit: mocks.isOverContextLimitMock,
}));

vi.mock("../../../lib/llm/parser.js", () => ({
  createStreamParser: vi.fn(() => ({
    process: mocks.parserProcessMock,
    flush: mocks.parserFlushMock,
  })),
}));

vi.mock("../../../services/chat/session/loop/events.js", () => ({
  createTurnEventState: mocks.createTurnEventStateMock,
  processParserEvents: mocks.processParserEventsMock,
}));

vi.mock("../../../services/chat/session/loop/budgets.js", () => ({
  createTurnBudgetState: vi.fn(() => ({
    toolBudgetExceededThisTurn: false,
    toolRunBudgetExceededThisTurn: false,
    toolPayloadExceededThisTurn: false,
  })),
  hasAnyTurnBudgetExceeded: vi.fn(
    (state: {
      toolBudgetExceededThisTurn: boolean;
      toolRunBudgetExceededThisTurn: boolean;
      toolPayloadExceededThisTurn: boolean;
    }) =>
      state.toolBudgetExceededThisTurn ||
      state.toolRunBudgetExceededThisTurn ||
      state.toolPayloadExceededThisTurn,
  ),
}));

vi.mock("../../../services/chat/session/shared/continuation.js", () => ({
  buildAgentContinuationPrompt: mocks.buildAgentContinuationPromptMock,
}));

vi.mock("../../../services/sse-utils/service.js", () => ({
  sendSSEError: mocks.sendSSEErrorMock,
  sendSSERecoverableError: mocks.sendSSERecoverableErrorMock,
}));

describe("runAgentLoop resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.computeTokenUsageMock.mockResolvedValue({
      totalContextTokens: 100,
      reservedOutputTokens: 50,
      contextWindowTokens: 4000,
    });
    mocks.isOverContextLimitMock.mockReturnValue(false);
    mocks.createTurnEventStateMock.mockReturnValue({
      doneTagDetectedThisTurn: false,
      codeOutputDetectedThisTurn: false,
      currentFilePath: undefined,
      isFirstFileChunk: true,
      sandboxTagDetected: false,
      totalToolCallsInRun: 0,
    });
    mocks.parserProcessMock.mockImplementation((chunk: string) =>
      chunk.includes("<edward_done")
        ? [{ type: ParserEventType.DONE }]
        : [],
    );
    mocks.parserFlushMock.mockReturnValue([]);
    mocks.processParserEventsMock.mockImplementation(
      async ({
        events,
        turnState,
      }: {
        events: Array<{ type: string }>;
        turnState: { doneTagDetectedThisTurn: boolean };
      }) => {
        if (events.some((event) => event.type === ParserEventType.DONE)) {
          turnState.doneTagDetectedThisTurn = true;
        }
      },
    );
    mocks.buildAgentContinuationPromptMock.mockReturnValue({
      prompt: "continue with action tags",
      truncated: false,
    });
  });

  it("terminates cleanly on a conversational reply without edward tags", async () => {
    mocks.streamResponseMock.mockImplementation(async function* () {
      yield "Hello! I'm Edward. What would you like me to build today?";
    });

    const { runAgentLoop } = await import(
      "../../../services/chat/session/loop/agentLoop.runner.js"
    );

    const result = await runAgentLoop({
      decryptedApiKey: "key",
      initialMessages: [{ role: MessageRole.User, content: "hi" }],
      preVerifiedDeps: [],
      systemPrompt: "system",
      framework: undefined,
      complexity: "moderate",
      mode: "generate",
      model: "gpt-5.1-codex",
      abortController: new AbortController(),
      userContent: "hi",
      workflow: {} as never,
      res: {} as never,
      chatId: "chat-1",
      isFollowUp: false,
      generatedFiles: new Map<string, string>(),
      declaredPackages: [],
      emitMeta: vi.fn(),
      runId: "run-1",
    });

    expect(mocks.streamResponseMock).toHaveBeenCalledTimes(1);
    expect(mocks.buildAgentContinuationPromptMock).not.toHaveBeenCalled();
    expect(result.agentTurn).toBe(1);
    expect(result.loopStopReason).toBe(AgentLoopStopReason.DONE);
  });

  it("nudges when response is too short to be a valid conversational reply", async () => {
    let streamCallCount = 0;
    mocks.streamResponseMock.mockImplementation(async function* () {
      streamCallCount += 1;
      if (streamCallCount === 1) {
        yield "OK";
        return;
      }
      yield "<edward_done />";
    });

    const { runAgentLoop } = await import(
      "../../../services/chat/session/loop/agentLoop.runner.js"
    );

    const result = await runAgentLoop({
      decryptedApiKey: "key",
      initialMessages: [{ role: MessageRole.User, content: "fix everything" }],
      preVerifiedDeps: [],
      systemPrompt: "system",
      framework: undefined,
      complexity: "moderate",
      mode: "generate",
      model: "gpt-4o-mini",
      abortController: new AbortController(),
      userContent: "fix everything",
      workflow: {} as never,
      res: {} as never,
      chatId: "chat-1",
      isFollowUp: false,
      generatedFiles: new Map<string, string>(),
      declaredPackages: [],
      emitMeta: vi.fn(),
      runId: "run-1",
    });

    expect(mocks.streamResponseMock).toHaveBeenCalledTimes(2);
    const secondStreamCall = mocks.streamResponseMock.mock.calls[1];
    const secondCallMessages = secondStreamCall?.[1] as
      | Array<{ role: MessageRole; content: string }>
      | undefined;
    const continuationPrompt = secondCallMessages?.[0]?.content ?? "";
    expect(continuationPrompt).toContain("continue with action tags");
    expect(continuationPrompt).toContain("No actionable tool/file output");
    expect(continuationPrompt).toContain("<edward_command");
    expect(continuationPrompt).toContain("<edward_web_search");
    expect(continuationPrompt).toContain("<edward_sandbox");
    expect(result.agentTurn).toBe(2);
    expect(result.loopStopReason).toBe(AgentLoopStopReason.DONE);
  });

  it("keeps running when continuation context is compacted", async () => {
    let streamCallCount = 0;
    mocks.streamResponseMock.mockImplementation(async function* () {
      streamCallCount += 1;
      if (streamCallCount === 1) {
        yield '<edward_command command="pwd" args="[]">';
        return;
      }
      yield "<edward_done />";
    });
    mocks.buildAgentContinuationPromptMock.mockReturnValue({
      prompt: "truncated continuation prompt",
      truncated: true,
    });
    mocks.processParserEventsMock.mockImplementation(
      async ({
        events,
        turnState,
        toolResultsThisTurn,
        context,
      }: {
        events: Array<{ type: string }>;
        turnState: { doneTagDetectedThisTurn: boolean };
        toolResultsThisTurn: Array<{
          tool: string;
          command?: string;
          args?: string[];
          stdout?: string;
          stderr?: string;
        }>;
        context: { turn?: number };
      }) => {
        if (context.turn === 1 && toolResultsThisTurn.length === 0) {
          toolResultsThisTurn.push({
            tool: "command",
            command: "pwd",
            args: [],
            stdout: "/workspace",
            stderr: "",
          });
        }
        if (events.some((event) => event.type === ParserEventType.DONE)) {
          turnState.doneTagDetectedThisTurn = true;
        }
      },
    );

    const { runAgentLoop } = await import(
      "../../../services/chat/session/loop/agentLoop.runner.js"
    );

    const result = await runAgentLoop({
      decryptedApiKey: "key",
      initialMessages: [{ role: MessageRole.User, content: "fix everything" }],
      preVerifiedDeps: [],
      systemPrompt: "system",
      framework: undefined,
      complexity: "moderate",
      mode: "generate",
      model: "gpt-4o-mini",
      abortController: new AbortController(),
      userContent: "fix everything",
      workflow: {} as never,
      res: {} as never,
      chatId: "chat-1",
      isFollowUp: false,
      generatedFiles: new Map<string, string>(),
      declaredPackages: [],
      emitMeta: vi.fn(),
      runId: "run-1",
    });

    expect(mocks.streamResponseMock).toHaveBeenCalledTimes(2);
    expect(mocks.sendSSERecoverableErrorMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("Continuation context was compacted"),
      expect.objectContaining({
        code: "continuation_prompt_truncated",
      }),
    );
    expect(result.loopStopReason).toBe(AgentLoopStopReason.DONE);
  });

  it("retries once when model stream fails before emitting any output", async () => {
    let streamCallCount = 0;
    mocks.streamResponseMock.mockImplementation(async function* () {
      streamCallCount += 1;
      if (streamCallCount === 1) {
        throw new Error("upstream transport reset");
      }
      yield "<edward_done />";
    });

    const { runAgentLoop } = await import(
      "../../../services/chat/session/loop/agentLoop.runner.js"
    );

    const result = await runAgentLoop({
      decryptedApiKey: "key",
      initialMessages: [{ role: MessageRole.User, content: "fix everything" }],
      preVerifiedDeps: [],
      systemPrompt: "system",
      framework: undefined,
      complexity: "moderate",
      mode: "generate",
      model: "gpt-4o-mini",
      abortController: new AbortController(),
      userContent: "fix everything",
      workflow: {} as never,
      res: {} as never,
      chatId: "chat-1",
      isFollowUp: false,
      generatedFiles: new Map<string, string>(),
      declaredPackages: [],
      emitMeta: vi.fn(),
      runId: "run-1",
    });

    expect(mocks.streamResponseMock).toHaveBeenCalledTimes(2);
    expect(mocks.sendSSERecoverableErrorMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("retrying turn once"),
      expect.objectContaining({
        code: "stream_retry",
      }),
    );
    expect(result.loopStopReason).toBe(AgentLoopStopReason.DONE);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentLoopStopReason } from "@edward/shared/streamEvents";
import { MessageRole } from "@edward/auth";
import { MAX_RESPONSE_SIZE } from "../../../utils/constants.js";

const streamResponseMock = vi.fn();
const computeTokenUsageMock = vi.fn();
const isOverContextLimitMock = vi.fn();
const processParserEventsMock = vi.fn();
const createTurnEventStateMock = vi.fn();
const sendSSEErrorMock = vi.fn();
const parserProcessMock = vi.fn();
const parserFlushMock = vi.fn();

vi.mock("../../../lib/llm/provider.client.js", () => ({
  streamResponse: streamResponseMock,
}));

vi.mock("../../../lib/llm/tokens.js", () => ({
  computeTokenUsage: computeTokenUsageMock,
  isOverContextLimit: isOverContextLimitMock,
}));

vi.mock("../../../lib/llm/parser.js", () => ({
  createStreamParser: vi.fn(() => ({
    process: parserProcessMock,
    flush: parserFlushMock,
  })),
}));

vi.mock("../../../services/chat/session/loop/events.js", () => ({
  createTurnEventState: createTurnEventStateMock,
  processParserEvents: processParserEventsMock,
}));

vi.mock("../../../services/chat/session/loop/budgets.js", () => ({
  createTurnBudgetState: vi.fn(() => ({
    toolBudgetExceededThisTurn: false,
    toolRunBudgetExceededThisTurn: false,
    toolPayloadExceededThisTurn: false,
  })),
  hasAnyTurnBudgetExceeded: vi.fn(() => false),
}));

vi.mock("../../../services/sse-utils/service.js", () => ({
  sendSSEError: sendSSEErrorMock,
}));

describe("runAgentLoop response size handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    computeTokenUsageMock.mockResolvedValue({
      totalContextTokens: 100,
      reservedOutputTokens: 50,
      contextWindowTokens: 4000,
    });
    isOverContextLimitMock.mockReturnValue(false);
    createTurnEventStateMock.mockReturnValue({
      doneTagDetectedThisTurn: false,
      currentFilePath: undefined,
      isFirstFileChunk: true,
      sandboxTagDetected: false,
      totalToolCallsInRun: 0,
    });
    processParserEventsMock.mockResolvedValue(undefined);

    streamResponseMock.mockImplementation(async function* () {
      yield "next";
    });
  });

  it("does not process flush events when response size is exceeded mid-turn", async () => {
    const { runAgentLoop } = await import(
      "../../../services/chat/session/loop/agentLoop.runner.js"
    );

    const result = await runAgentLoop({
      decryptedApiKey: "key",
      initialMessages: [{ role: MessageRole.User, content: "hello" }],
      preVerifiedDeps: [],
      systemPrompt: "system",
      framework: undefined,
      complexity: "simple",
      mode: "generate",
      model: "gpt-4o-mini",
      abortController: new AbortController(),
      userContent: "hello",
      workflow: {} as never,
      res: {} as never,
      chatId: "chat-1",
      isFollowUp: false,
      generatedFiles: new Map<string, string>(),
      declaredPackages: [],
      emitMeta: vi.fn(),
      runId: "run-1",
      resumeCheckpoint: {
        turn: 0,
        fullRawResponse: "x".repeat(MAX_RESPONSE_SIZE),
        agentMessages: [{ role: MessageRole.User, content: "hello" }],
        sandboxTagDetected: false,
        totalToolCallsInRun: 0,
      },
    });

    expect(result.loopStopReason).toBe(AgentLoopStopReason.RESPONSE_SIZE_EXCEEDED);
    expect(processParserEventsMock).not.toHaveBeenCalled();
    expect(parserFlushMock).not.toHaveBeenCalled();
    expect(sendSSEErrorMock).toHaveBeenCalledWith(
      expect.anything(),
      "Response exceeded maximum size limit",
      expect.objectContaining({
        code: "response_size_exceeded",
      }),
    );
  });
});

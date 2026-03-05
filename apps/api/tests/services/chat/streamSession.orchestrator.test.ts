import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { MessageRole } from "@edward/auth";
import { ParserEventType } from "@edward/shared/streamEvents";

const streamResponseMock = vi.fn();
const saveMessageMock = vi.fn();
const handleParserEventMock = vi.fn();
const recordDailyChatSuccessfulResponseMock = vi.fn();
const getDailyChatSuccessSnapshotMock = vi.fn();
const FIXED_RESET_AT_MS = 1_900_000_060_000;
const FIXED_WORKFLOW_CREATED_AT_MS = 1_900_000_000_000;
const FIXED_WORKFLOW_UPDATED_AT_MS = 1_900_000_030_000;

function isStreamRequest(value: unknown): value is Request {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.on === "function";
}

function createStreamRequest(): Request {
  const candidate: Record<string, unknown> = {
    on: vi.fn(),
  };
  if (!isStreamRequest(candidate)) {
    throw new Error("Invalid stream request fixture");
  }
  return candidate;
}

function isStreamResponse(value: unknown): value is Response {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.writable === "boolean" &&
    typeof candidate.writableEnded === "boolean" &&
    typeof candidate.write === "function" &&
    typeof candidate.end === "function"
  );
}

function createStreamResponse(writes?: string[]): Response {
  const candidate: Record<string, unknown> = {
    writable: true,
    writableEnded: false,
    write: vi.fn((chunk?: string) => {
      if (writes && typeof chunk === "string") {
        writes.push(chunk);
      }
      return true;
    }),
    end: vi.fn(function (this: { writableEnded: boolean }) {
      this.writableEnded = true;
    }),
  };
  if (!isStreamResponse(candidate)) {
    throw new Error("Invalid stream response fixture");
  }
  return candidate;
}

vi.mock("../../../lib/llm/provider.client.js", () => ({
  streamResponse: streamResponseMock,
  generateResponse: vi.fn(async () => '{"title":"Demo","description":"Demo description"}'),
}));

vi.mock("../../../lib/llm/compose.js", () => ({
  composePrompt: vi.fn(() => "test-system-prompt"),
}));

vi.mock("../../../lib/llm/tokens.js", () => ({
  computeTokenUsage: vi.fn(async () => ({
    provider: "openai",
    model: "gpt-4o-mini",
    method: "approx",
    contextWindowTokens: 128000,
    reservedOutputTokens: 4096,
    inputTokens: 100,
    totalContextTokens: 10000,
    remainingInputTokens: 123904,
    perMessage: [],
  })),
  isOverContextLimit: vi.fn(() => false),
}));

vi.mock("../../../lib/llm/tokens/openaiCounter.js", () => ({
  countOutputTokens: vi.fn(() => 32),
}));

vi.mock("../../../services/chat.service.js", () => ({
  saveMessage: saveMessageMock,
  updateChatMeta: vi.fn(),
}));

vi.mock("../../../services/rateLimit/chatDailySuccess.service.js", () => ({
  recordDailyChatSuccessfulResponse: recordDailyChatSuccessfulResponseMock,
  getDailyChatSuccessSnapshot: getDailyChatSuccessSnapshotMock,
}));

vi.mock("../../../services/websearch/urlScraper.service.js", () => ({
  prepareUrlScrapeContext: vi.fn(async () => ({ results: [], contextMessage: null })),
}));

vi.mock("../../../services/websearch/urlScraper/context.js", () => ({
  formatUrlScrapeAssistantTags: vi.fn(() => ""),
}));

vi.mock("../../../services/sandbox/lifecycle/cleanup.js", () => ({
  cleanupSandbox: vi.fn(),
}));

vi.mock("../../../services/sandbox/write/flush.js", () => ({
  flushSandbox: vi.fn(),
}));

vi.mock("../../../services/queue/enqueue.js", () => ({
  enqueueBuildJob: vi.fn(),
}));

vi.mock("../../../services/sandbox/state.service.js", () => ({
  getSandboxState: vi.fn(async () => null),
}));

vi.mock("../../../services/sandbox/templates/template.registry.js", () => ({
  normalizeFramework: vi.fn((value: string) => value),
}));

vi.mock("../../../services/planning/workflow/store.js", () => ({
  saveWorkflow: vi.fn(),
}));

vi.mock("../../../services/planning/validators/postgenValidator.js", () => ({
  validateGeneratedOutput: vi.fn(() => ({ valid: true, violations: [] })),
}));

vi.mock("../../../services/chat/session/events/handler.js", () => ({
  handleParserEvent: handleParserEventMock,
}));

describe("runStreamSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    let streamCallCount = 0;
    streamResponseMock.mockImplementation(async function* () {
      streamCallCount += 1;
      if (streamCallCount === 1) {
        yield 'Checking workspace...<edward_command command="pwd" args="[]"><edward_done />';
        return;
      }

      yield "Verified command output and completed the fix.<edward_done />";
    });

    handleParserEventMock.mockImplementation(async (ctx, event) => {
      if (event.type === ParserEventType.COMMAND) {
        ctx.toolResultsThisTurn.push({
          tool: "command",
          command: event.command,
          args: event.args ?? [],
          stdout: "/home/node/app\n",
          stderr: "",
        });
        return {
          handled: true,
          currentFilePath: ctx.currentFilePath,
          isFirstFileChunk: ctx.isFirstFileChunk,
          sandboxTagDetected: ctx.sandboxTagDetected,
        };
      }

      return {
        handled: false,
        currentFilePath: ctx.currentFilePath,
        isFirstFileChunk: ctx.isFirstFileChunk,
        sandboxTagDetected: ctx.sandboxTagDetected,
      };
    });

    saveMessageMock.mockResolvedValue("assistant-msg-id");
    recordDailyChatSuccessfulResponseMock.mockResolvedValue(undefined);
    getDailyChatSuccessSnapshotMock.mockResolvedValue({
      limit: 50,
      current: 1,
      remaining: 49,
      resetAtMs: FIXED_RESET_AT_MS,
      isLimited: false,
    });
  });

  it("continues after tool turn even when DONE appears in the same turn", async () => {
    const { runStreamSession } = await import(
      "../../../services/chat/session/orchestrator/runStreamSession.orchestrator.js"
    );

    const writes: string[] = [];
    const req = createStreamRequest();
    const res = createStreamResponse(writes);

    await runStreamSession({
      req,
      res,
      workflow: {
        id: "wf-1",
        userId: "user-1",
        chatId: "chat-1",
        status: "pending",
        currentStep: "ANALYZE",
        history: [],
        context: { framework: "vanilla", errors: [] },
        createdAt: FIXED_WORKFLOW_CREATED_AT_MS,
        updatedAt: FIXED_WORKFLOW_UPDATED_AT_MS,
      },
      userId: "user-1",
      chatId: "chat-1",
      decryptedApiKey: "key",
      userContent: "build a simple page",
      userTextContent: "build a simple page",
      userMessageId: "msg-user-1",
      assistantMessageId: "msg-assistant-1",
      preVerifiedDeps: [],
      isFollowUp: false,
      intent: "generate",
      historyMessages: [],
      projectContext: "",
      model: "gpt-4o-mini",
    });

    expect(streamResponseMock).toHaveBeenCalledTimes(2);

    const loopMetaEvents = writes
      .filter((line) => line.startsWith("data: {"))
      .map((line) => JSON.parse(line.slice(6)))
      .filter((event) => event.type === ParserEventType.META);

    const turnStartEvents = loopMetaEvents.filter(
      (event) => event.phase === "turn_start",
    );
    const turnCompleteEvents = loopMetaEvents.filter(
      (event) => event.phase === "turn_complete",
    );
    const sessionCompleteEvents = loopMetaEvents.filter(
      (event) =>
        event.phase === "session_complete" &&
        typeof event.loopStopReason === "string",
    );

    expect(turnStartEvents).toHaveLength(2);
    expect(turnStartEvents[0].turn).toBe(1);
    expect(turnStartEvents[0].runId).toBe("msg-assistant-1");
    expect(turnStartEvents[1].turn).toBe(2);
    expect(turnStartEvents[1].runId).toBe("msg-assistant-1");

    expect(turnCompleteEvents).toHaveLength(2);
    expect(turnCompleteEvents[0].turn).toBe(1);
    expect(turnCompleteEvents[0].toolCount).toBe(1);
    expect(turnCompleteEvents[0].runId).toBe("msg-assistant-1");
    expect(turnCompleteEvents[1].turn).toBe(2);
    expect(turnCompleteEvents[1].toolCount).toBe(0);
    expect(turnCompleteEvents[1].runId).toBe("msg-assistant-1");

    expect(sessionCompleteEvents).toHaveLength(1);
    expect(sessionCompleteEvents[0].loopStopReason).toBe("done");
    expect(sessionCompleteEvents[0].runId).toBe("msg-assistant-1");

    expect(saveMessageMock).toHaveBeenCalledWith(
      "chat-1",
      "user-1",
      MessageRole.Assistant,
      expect.any(String),
      "msg-assistant-1",
      expect.objectContaining({
        inputTokens: 100,
      }),
    );
    expect(recordDailyChatSuccessfulResponseMock).toHaveBeenCalledWith("user-1");
    expect(getDailyChatSuccessSnapshotMock).toHaveBeenCalledWith("user-1");
  });

  it("does not record daily chat success when assistant output is empty", async () => {
    streamResponseMock.mockImplementation(async function* () {
      yield "";
    });

    const { runStreamSession } = await import(
      "../../../services/chat/session/orchestrator/runStreamSession.orchestrator.js"
    );

    const req = createStreamRequest();
    const res = createStreamResponse();

    await runStreamSession({
      req,
      res,
      workflow: {
        id: "wf-1",
        userId: "user-1",
        chatId: "chat-1",
        status: "pending",
        currentStep: "ANALYZE",
        history: [],
        context: { framework: "vanilla", errors: [] },
        createdAt: FIXED_WORKFLOW_CREATED_AT_MS,
        updatedAt: FIXED_WORKFLOW_UPDATED_AT_MS,
      },
      userId: "user-1",
      chatId: "chat-1",
      decryptedApiKey: "key",
      userContent: "build a simple page",
      userTextContent: "build a simple page",
      userMessageId: "msg-user-1",
      assistantMessageId: "msg-assistant-1",
      preVerifiedDeps: [],
      isFollowUp: false,
      intent: "generate",
      historyMessages: [],
      projectContext: "",
      model: "gpt-4o-mini",
    });

    expect(recordDailyChatSuccessfulResponseMock).not.toHaveBeenCalled();
    expect(getDailyChatSuccessSnapshotMock).not.toHaveBeenCalled();
  });
});

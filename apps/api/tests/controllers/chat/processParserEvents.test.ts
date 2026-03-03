import { beforeEach, describe, expect, it, vi } from "vitest";
import { ParserEventType } from "@edward/shared/streamEvents";
import type { WorkflowState } from "../../../services/planning/schemas.js";

const handleParserEventMock = vi.fn();
const sendSSEEventMock = vi.fn();

vi.mock("../../../services/chat/session/events/handler.js", () => ({
  handleParserEvent: handleParserEventMock,
}));

vi.mock("../../../services/sse-utils/service.js", () => ({
  sendSSEEvent: sendSSEEventMock,
}));

describe("processParserEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks code output only after FILE_START handling succeeds", async () => {
    const { createTurnEventState, processParserEvents } = await import(
      "../../../services/chat/session/loop/events.js"
    );
    const { createTurnBudgetState } = await import(
      "../../../services/chat/session/loop/budgets.js"
    );

    const context = {
      workflow: {
        id: "wf-1",
        userId: "u-1",
        chatId: "c-1",
        context: { errors: [] },
        history: [],
        status: "pending",
        currentStep: "analyze",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as unknown as WorkflowState,
      res: {} as never,
      chatId: "c-1",
      isFollowUp: false,
      generatedFiles: new Map<string, string>(),
      declaredPackages: [],
      toolResultsThisTurn: [],
      runId: "run-1",
      turn: 1,
      installTaskQueue: {
        enqueue: () => undefined,
        waitForIdle: async () => undefined,
      },
      abortSignal: new AbortController().signal,
    };

    handleParserEventMock.mockResolvedValueOnce({
      handled: true,
      currentFilePath: undefined,
      isFirstFileChunk: true,
      sandboxTagDetected: false,
    });

    const failedState = createTurnEventState(false, 0);
    await processParserEvents({
      events: [{ type: ParserEventType.FILE_START, path: "src/App.tsx" }],
      turnState: failedState,
      budgetState: createTurnBudgetState(),
      toolResultsThisTurn: [],
      context,
    });

    expect(failedState.codeOutputDetectedThisTurn).toBe(false);

    handleParserEventMock.mockResolvedValueOnce({
      handled: true,
      currentFilePath: "src/App.tsx",
      isFirstFileChunk: true,
      sandboxTagDetected: true,
    });

    const successState = createTurnEventState(false, 0);
    await processParserEvents({
      events: [{ type: ParserEventType.FILE_START, path: "src/App.tsx" }],
      turnState: successState,
      budgetState: createTurnBudgetState(),
      toolResultsThisTurn: [],
      context,
    });

    expect(successState.codeOutputDetectedThisTurn).toBe(true);
  });
});

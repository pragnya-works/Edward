import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RUN_STATUS,
} from "@edward/auth";
import {
  StreamTerminationReason,
} from "@edward/shared/streamEvents";

const mocks = vi.hoisted(() => ({
  getRunById: vi.fn(),
  isTerminalRunStatus: vi.fn(),
  updateRun: vi.fn(),
  classifyAssistantError: vi.fn(),
  mapTerminationToStatus: vi.fn(),
  persistRunEventWithLog: vi.fn(),
  updateRunWithLog: vi.fn(),
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@edward/auth", async () => {
  const actual = await vi.importActual<typeof import("@edward/auth")>("@edward/auth");
  return {
    ...actual,
    getRunById: mocks.getRunById,
    isTerminalRunStatus: mocks.isTerminalRunStatus,
    updateRun: mocks.updateRun,
  };
});

vi.mock("../../../lib/llm/errorPresentation.js", () => ({
  classifyAssistantError: mocks.classifyAssistantError,
}));

vi.mock("../../../services/runs/agent-run-worker/processor.helpers.js", () => ({
  mapTerminationToStatus: mocks.mapTerminationToStatus,
  persistRunEventWithLog: mocks.persistRunEventWithLog,
  updateRunWithLog: mocks.updateRunWithLog,
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: mocks.logger,
}));

describe("agent run processor finalize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRunById.mockResolvedValue({ status: RUN_STATUS.RUNNING });
    mocks.isTerminalRunStatus.mockReturnValue(false);
    mocks.updateRun.mockResolvedValue(undefined);
    mocks.mapTerminationToStatus.mockReturnValue({
      status: RUN_STATUS.COMPLETED,
      state: "COMPLETE",
    });
    mocks.classifyAssistantError.mockReturnValue({
      code: "ERR",
      title: "Failure",
      severity: "fatal",
      message: "classified failure",
      action: "retry",
      actionLabel: "Retry",
      actionUrl: null,
    });
    mocks.persistRunEventWithLog.mockResolvedValue(true);
    mocks.updateRunWithLog.mockResolvedValue(true);
  });

  it("finalizes successful run when run is still active", async () => {
    const { finalizeSuccessfulRun } = await import(
      "../../../services/runs/agent-run-worker/processor.finalize.js"
    );

    await finalizeSuccessfulRun({
      runId: "run-1",
      run: {
        chatId: "chat-1",
        userMessageId: "user-msg",
        assistantMessageId: "assistant-msg",
      },
      metadata: {
        traceId: "trace-1",
        isFollowUp: false,
      } as never,
      currentTurn: 2,
      latestLoopStopReason: "done",
      latestTerminationReason: StreamTerminationReason.COMPLETED,
      latestErrorMessage: null,
      firstTokenLatencyMs: 30,
      startedAtMs: Date.now() - 100,
    });

    expect(mocks.mapTerminationToStatus).toHaveBeenCalledWith(
      StreamTerminationReason.COMPLETED,
    );
    expect(mocks.updateRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({
        status: RUN_STATUS.COMPLETED,
        state: "COMPLETE",
        currentTurn: 2,
      }),
    );
    expect(mocks.logger.info).toHaveBeenCalledTimes(1);
  });

  it("skips successful finalize when run is already terminal", async () => {
    const { finalizeSuccessfulRun } = await import(
      "../../../services/runs/agent-run-worker/processor.finalize.js"
    );

    mocks.getRunById.mockResolvedValueOnce({ status: RUN_STATUS.FAILED });
    mocks.isTerminalRunStatus.mockReturnValueOnce(true);

    await finalizeSuccessfulRun({
      runId: "run-1",
      run: {
        chatId: "chat-1",
        userMessageId: "user-msg",
        assistantMessageId: "assistant-msg",
      },
      metadata: { traceId: "trace-1" } as never,
      currentTurn: 1,
      latestLoopStopReason: null,
      latestTerminationReason: null,
      latestErrorMessage: "err",
      firstTokenLatencyMs: null,
      startedAtMs: Date.now() - 5,
    });

    expect(mocks.updateRun).not.toHaveBeenCalled();
  });

  it("finalizes failed run and persists terminal events", async () => {
    const { finalizeFailedRun } = await import(
      "../../../services/runs/agent-run-worker/processor.finalize.js"
    );

    const flushCapturedEvents = vi.fn().mockRejectedValueOnce(new Error("flush failed"));

    await finalizeFailedRun({
      runId: "run-2",
      run: {
        chatId: "chat-2",
        userMessageId: "user-msg",
        assistantMessageId: "assistant-msg",
      },
      metadata: {
        isFollowUp: false,
      } as never,
      currentTurn: 3,
      publisher: { publish: vi.fn() } as never,
      flushCapturedEvents,
      error: new Error("provider failed"),
    });

    expect(mocks.classifyAssistantError).toHaveBeenCalledWith("provider failed");
    expect(mocks.persistRunEventWithLog).toHaveBeenCalledTimes(2);
    expect(mocks.updateRunWithLog).toHaveBeenCalledWith(
      "run-2",
      expect.objectContaining({
        status: RUN_STATUS.FAILED,
        state: "FAILED",
      }),
      "stream-failure-terminal-update",
    );
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
  });

  it("skips failed finalize when run is already terminal", async () => {
    const { finalizeFailedRun } = await import(
      "../../../services/runs/agent-run-worker/processor.finalize.js"
    );

    mocks.getRunById.mockResolvedValueOnce({ status: RUN_STATUS.CANCELLED });
    mocks.isTerminalRunStatus.mockReturnValueOnce(true);

    await finalizeFailedRun({
      runId: "run-3",
      run: {
        chatId: "chat-3",
        userMessageId: "user-msg",
        assistantMessageId: "assistant-msg",
      },
      metadata: { isFollowUp: true } as never,
      currentTurn: 1,
      publisher: { publish: vi.fn() } as never,
      flushCapturedEvents: vi.fn().mockResolvedValue(undefined),
      error: new Error("failure"),
    });

    expect(mocks.persistRunEventWithLog).not.toHaveBeenCalled();
    expect(mocks.updateRunWithLog).not.toHaveBeenCalled();
  });
});

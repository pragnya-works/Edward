import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MetaPhase,
  ParserEventType,
  StreamTerminationReason,
} from "@edward/shared/streamEvents";

const mocks = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
  },
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: mocks.logger,
}));

describe("agent run processor event progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures first token latency and tool/apply state transitions", async () => {
    const { trackRunEventProgress } = await import(
      "../../../services/runs/agent-run-worker/processor.events.js"
    );

    const updateRunStateIfNeeded = vi.fn().mockResolvedValue(undefined);
    const progress = {
      currentTurn: 1,
      firstTokenLatencyMs: null,
      latestLoopStopReason: null,
      latestTerminationReason: null,
      latestErrorMessage: null,
      turnStartTimes: new Map<number, number>(),
    };

    await trackRunEventProgress({
      runId: "run-1",
      event: { type: ParserEventType.TEXT, content: "hello" } as never,
      startedAtMs: Date.now() - 20,
      progress,
      updateRunStateIfNeeded,
    });

    expect(progress.firstTokenLatencyMs).not.toBeNull();

    await trackRunEventProgress({
      runId: "run-1",
      event: { type: ParserEventType.COMMAND } as never,
      startedAtMs: Date.now(),
      progress,
      updateRunStateIfNeeded,
    });

    await trackRunEventProgress({
      runId: "run-1",
      event: { type: ParserEventType.FILE_START } as never,
      startedAtMs: Date.now(),
      progress,
      updateRunStateIfNeeded,
    });

    expect(updateRunStateIfNeeded).toHaveBeenNthCalledWith(1, "TOOL_EXEC", 1);
    expect(updateRunStateIfNeeded).toHaveBeenNthCalledWith(2, "APPLY", 1);
  });

  it("tracks error and turn/session meta states", async () => {
    const { trackRunEventProgress } = await import(
      "../../../services/runs/agent-run-worker/processor.events.js"
    );

    const updateRunStateIfNeeded = vi.fn().mockResolvedValue(undefined);
    const progress = {
      currentTurn: 1,
      firstTokenLatencyMs: null,
      latestLoopStopReason: null,
      latestTerminationReason: null,
      latestErrorMessage: null,
      turnStartTimes: new Map<number, number>(),
    };

    await trackRunEventProgress({
      runId: "run-1",
      event: { type: ParserEventType.ERROR, message: "llm failure" } as never,
      startedAtMs: Date.now(),
      progress,
      updateRunStateIfNeeded,
    });

    expect(progress.latestErrorMessage).toBe("llm failure");

    await trackRunEventProgress({
      runId: "run-1",
      event: {
        type: ParserEventType.META,
        phase: MetaPhase.TURN_START,
        turn: 2,
      } as never,
      startedAtMs: Date.now(),
      progress,
      updateRunStateIfNeeded,
    });

    expect(progress.currentTurn).toBe(2);
    expect(progress.turnStartTimes.has(2)).toBe(true);

    await trackRunEventProgress({
      runId: "run-1",
      event: {
        type: ParserEventType.META,
        phase: MetaPhase.TURN_COMPLETE,
        turn: 2,
      } as never,
      startedAtMs: Date.now(),
      progress,
      updateRunStateIfNeeded,
    });

    expect(progress.turnStartTimes.has(2)).toBe(false);
    expect(mocks.logger.info).toHaveBeenCalledTimes(1);

    await trackRunEventProgress({
      runId: "run-1",
      event: {
        type: ParserEventType.META,
        phase: MetaPhase.SESSION_COMPLETE,
        loopStopReason: "done",
        terminationReason: StreamTerminationReason.STREAM_FAILED,
      } as never,
      startedAtMs: Date.now(),
      progress,
      updateRunStateIfNeeded,
    });

    expect(progress.latestLoopStopReason).toBe("done");
    expect(progress.latestTerminationReason).toBe(StreamTerminationReason.STREAM_FAILED);
  });
});

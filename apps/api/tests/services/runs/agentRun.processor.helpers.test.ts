import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MetaPhase,
  ParserEventType,
  StreamTerminationReason,
} from "@edward/shared/streamEvents";

const mocks = vi.hoisted(() => ({
  dbReturning: vi.fn(),
  updateRun: vi.fn(),
  persistRunEvent: vi.fn(),
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("@edward/auth", () => ({
  and: vi.fn(),
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: mocks.dbReturning,
        })),
      })),
    })),
  },
  eq: vi.fn(),
  inArray: vi.fn(),
  RUN_STATUS: {
    QUEUED: "queued",
    RUNNING: "running",
    FAILED: "failed",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
  },
  run: {
    id: "id",
    status: "status",
  },
  updateRun: mocks.updateRun,
}));

vi.mock("../../../services/runs/runEvents.service.js", () => ({
  persistRunEvent: mocks.persistRunEvent,
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: mocks.logger,
}));

describe("agent run processor helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbReturning.mockResolvedValue([{ id: "run-1" }]);
    mocks.updateRun.mockResolvedValue(undefined);
    mocks.persistRunEvent.mockResolvedValue(undefined);
  });

  it("captures SSE events and flushes pending writes", async () => {
    const { createRunEventCaptureResponse } = await import(
      "../../../services/runs/agent-run-worker/processor.helpers.js"
    );

    const onEvent = vi.fn().mockResolvedValue(undefined);
    const response = createRunEventCaptureResponse(onEvent);

    response.write(
      `data: ${JSON.stringify({ type: ParserEventType.TEXT, chunk: "hi" })}\n\n` +
        `data: ${JSON.stringify({ type: ParserEventType.ERROR, message: "oops" })}\n\n` +
        "data: [DONE]\n\n",
    );

    await response.flushPending();

    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it("surfaces parse/persist failures from captured events", async () => {
    const { createRunEventCaptureResponse } = await import(
      "../../../services/runs/agent-run-worker/processor.helpers.js"
    );

    const onEvent = vi.fn().mockResolvedValue(undefined);
    const response = createRunEventCaptureResponse(onEvent);

    response.write("data: {bad json}\n\n");

    await expect(response.flushPending()).rejects.toThrow();
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  it("accepts Buffer chunks and stops writes after end", async () => {
    const { createRunEventCaptureResponse } = await import(
      "../../../services/runs/agent-run-worker/processor.helpers.js"
    );

    const onEvent = vi.fn().mockResolvedValue(undefined);
    const response = createRunEventCaptureResponse(onEvent);

    expect(
      response.write(
        Buffer.from(
          `data: ${JSON.stringify({ type: ParserEventType.TEXT, chunk: "buffer" })}\n\n`,
        ),
      ),
    ).toBe(true);

    response.end();
    expect(response.write(`data: ${JSON.stringify({ type: ParserEventType.TEXT })}\n\n`)).toBe(
      false,
    );

    await response.flushPending();
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid stream payload shapes and skips future writes after failure", async () => {
    const { createRunEventCaptureResponse } = await import(
      "../../../services/runs/agent-run-worker/processor.helpers.js"
    );

    const onEvent = vi.fn().mockResolvedValue(undefined);
    const response = createRunEventCaptureResponse(onEvent);

    response.write("data: {}\n\n");
    await expect(response.flushPending()).rejects.toThrow();

    response.write(`data: ${JSON.stringify({ type: ParserEventType.TEXT, chunk: "late" })}\n\n`);
    await expect(response.flushPending()).rejects.toThrow();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("maps termination reasons to run status/state", async () => {
    const { mapTerminationToStatus } = await import(
      "../../../services/runs/agent-run-worker/processor.helpers.js"
    );

    expect(mapTerminationToStatus(null)).toEqual({ status: "failed", state: "FAILED" });
    expect(mapTerminationToStatus(StreamTerminationReason.CLIENT_DISCONNECT)).toEqual({
      status: "cancelled",
      state: "CANCELLED",
    });
    expect(mapTerminationToStatus(StreamTerminationReason.STREAM_FAILED)).toEqual({
      status: "failed",
      state: "FAILED",
    });
    expect(mapTerminationToStatus(StreamTerminationReason.ABORTED)).toEqual({
      status: "failed",
      state: "FAILED",
    });
    expect(mapTerminationToStatus(StreamTerminationReason.STREAM_TIMEOUT)).toEqual({
      status: "failed",
      state: "FAILED",
    });
    expect(mapTerminationToStatus(StreamTerminationReason.SLOW_CLIENT)).toEqual({
      status: "failed",
      state: "FAILED",
    });
    expect(mapTerminationToStatus(StreamTerminationReason.COMPLETED)).toEqual({
      status: "completed",
      state: "COMPLETE",
    });
  });

  it("reads terminal termination reason only from session-complete meta events", async () => {
    const { readTerminationFromTerminalEvent } = await import(
      "../../../services/runs/agent-run-worker/processor.helpers.js"
    );

    expect(
      readTerminationFromTerminalEvent({ type: ParserEventType.TEXT } as never),
    ).toBeNull();

    expect(
      readTerminationFromTerminalEvent({
        type: ParserEventType.META,
        phase: MetaPhase.TURN_COMPLETE,
      } as never),
    ).toBeNull();

    expect(
      readTerminationFromTerminalEvent({
        type: ParserEventType.META,
        phase: MetaPhase.SESSION_COMPLETE,
        terminationReason: StreamTerminationReason.STREAM_FAILED,
      } as never),
    ).toBe(StreamTerminationReason.STREAM_FAILED);

    expect(
      readTerminationFromTerminalEvent({
        type: ParserEventType.META,
        phase: MetaPhase.SESSION_COMPLETE,
      } as never),
    ).toBeNull();
  });

  it("transitions run to running only when queued", async () => {
    const { markRunRunningIfAdmissible } = await import(
      "../../../services/runs/agent-run-worker/processor.helpers.js"
    );

    await expect(markRunRunningIfAdmissible("run-1", new Date())).resolves.toBe(true);

    mocks.dbReturning.mockResolvedValueOnce([]);
    await expect(markRunRunningIfAdmissible("run-2", new Date())).resolves.toBe(false);
  });

  it("logs and returns false when run update fails", async () => {
    const { updateRunWithLog } = await import(
      "../../../services/runs/agent-run-worker/processor.helpers.js"
    );

    mocks.updateRun.mockRejectedValueOnce(new Error("db fail"));

    await expect(updateRunWithLog("run-1", { state: "FAILED" }, "ctx")).resolves.toBe(false);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  it("returns true when run update succeeds", async () => {
    const { updateRunWithLog } = await import(
      "../../../services/runs/agent-run-worker/processor.helpers.js"
    );

    await expect(updateRunWithLog("run-1", { state: "FAILED" }, "ctx")).resolves.toBe(true);
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it("logs and returns false when event persistence fails", async () => {
    const { persistRunEventWithLog } = await import(
      "../../../services/runs/agent-run-worker/processor.helpers.js"
    );

    mocks.persistRunEvent.mockRejectedValueOnce(new Error("persist fail"));

    await expect(
      persistRunEventWithLog("run-1", { type: ParserEventType.TEXT } as never, { publish: vi.fn() }, "ctx"),
    ).resolves.toBe(false);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  it("returns true when event persistence succeeds", async () => {
    const { persistRunEventWithLog } = await import(
      "../../../services/runs/agent-run-worker/processor.helpers.js"
    );

    await expect(
      persistRunEventWithLog("run-1", { type: ParserEventType.TEXT } as never, { publish: vi.fn() }, "ctx"),
    ).resolves.toBe(true);
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });
});

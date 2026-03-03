import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../middleware/auth.js";

const getRunByIdMock = vi.fn();
const getRunEventsAfterMock = vi.fn();
const isTerminalRunStatusMock = vi.fn();
const getRunEventChannelMock = vi.fn();
const createRedisClientMock = vi.fn();
const configureSSEBackpressureMock = vi.fn();
const sendSSECommentMock = vi.fn();
const sendSSEDoneMock = vi.fn();
const sendSSEEventWithIdMock = vi.fn();

vi.mock("@edward/auth", () => ({
  getRunById: getRunByIdMock,
  getRunEventsAfter: getRunEventsAfterMock,
  isTerminalRunStatus: isTerminalRunStatusMock,
}));

vi.mock("../../../lib/redis.js", () => ({
  createRedisClient: createRedisClientMock,
}));

vi.mock("../../../services/runs/runEvents.service.js", () => ({
  getRunEventChannel: getRunEventChannelMock,
}));

vi.mock("../../../services/sse-utils/service.js", () => ({
  configureSSEBackpressure: configureSSEBackpressureMock,
  sendSSEComment: sendSSECommentMock,
  sendSSEDone: sendSSEDoneMock,
  sendSSEEventWithId: sendSSEEventWithIdMock,
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

interface RedisSubMock {
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
}

function createRedisSubMock(): RedisSubMock {
  return {
    on: vi.fn(),
    subscribe: vi.fn(async () => {}),
    unsubscribe: vi.fn(async () => {}),
    quit: vi.fn(async () => {}),
  };
}

function createReqMock() {
  const headers: Record<string, string> = {};
  return {
    query: {},
    headers,
    on: vi.fn(),
  };
}

function createResMock(headersSent = false) {
  return {
    headersSent,
    writable: true,
    writableEnded: false,
    setHeader: vi.fn(),
    write: vi.fn(() => true),
    end: vi.fn(function (this: { writableEnded: boolean }) {
      this.writableEnded = true;
    }),
  };
}

function asStreamRequest(req: ReturnType<typeof createReqMock>): AuthenticatedRequest {
  return req as unknown as AuthenticatedRequest;
}

function asStreamResponse(res: ReturnType<typeof createResMock>): Response {
  return res as unknown as Response;
}

function getMessageHandler(
  redisSub: RedisSubMock,
): (channel: string, payload: string) => void {
  const messageHandlerCall = redisSub.on.mock.calls.find(
    ([event]) => event === "message",
  );
  expect(messageHandlerCall?.[1]).toBeTypeOf("function");
  return messageHandlerCall?.[1] as (channel: string, payload: string) => void;
}

describe("streamRunEventsFromPersistence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getRunEventChannelMock.mockReturnValue("edward:run-events:run-1");
    getRunEventsAfterMock.mockResolvedValue([]);
    getRunByIdMock.mockResolvedValue({
      id: "run-1",
      status: "completed",
    });
    isTerminalRunStatusMock.mockImplementation(
      (status: string) =>
        status === "completed" || status === "failed" || status === "cancelled",
    );
    sendSSEEventWithIdMock.mockReturnValue(true);
  });

  it("does not set headers when SSE has already started", async () => {
    const redisSub = createRedisSubMock();
    createRedisClientMock.mockReturnValue(redisSub);

    const req = createReqMock();
    const res = createResMock(true);

    const { streamRunEventsFromPersistence } = await import(
      "../../../services/run-event-stream-utils/service.js"
    );

    await streamRunEventsFromPersistence({
      req: asStreamRequest(req),
      res: asStreamResponse(res),
      runId: "run-1",
    });

    expect(res.setHeader).not.toHaveBeenCalled();
    expect(configureSSEBackpressureMock).toHaveBeenCalledTimes(1);
    expect(redisSub.subscribe).toHaveBeenCalledWith("edward:run-events:run-1");
    expect(sendSSEDoneMock).toHaveBeenCalledTimes(1);
  });

  it("sets SSE headers for direct run-event endpoint responses", async () => {
    const redisSub = createRedisSubMock();
    createRedisClientMock.mockReturnValue(redisSub);

    const req = createReqMock();
    const res = createResMock(false);

    const { streamRunEventsFromPersistence } = await import(
      "../../../services/run-event-stream-utils/service.js"
    );

    await streamRunEventsFromPersistence({
      req: asStreamRequest(req),
      res: asStreamResponse(res),
      runId: "run-1",
    });

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/event-stream",
    );
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");
    expect(res.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
    expect(configureSSEBackpressureMock).toHaveBeenCalledTimes(1);
  });

  it("closes stream when replay buffer overflows from live events", async () => {
    const redisSub = createRedisSubMock();
    createRedisClientMock.mockReturnValue(redisSub);

    const replayBatchResolver: {
      current: ((value: Array<unknown>) => void) | null;
    } = { current: null };
    getRunEventsAfterMock.mockImplementation(
      () =>
        new Promise<Array<unknown>>((resolve) => {
          replayBatchResolver.current = resolve;
        }),
    );
    getRunByIdMock.mockResolvedValue({
      id: "run-1",
      status: "running",
    });
    isTerminalRunStatusMock.mockReturnValue(false);

    const req = createReqMock();
    const res = createResMock(true);

    const { streamRunEventsFromPersistence } = await import(
      "../../../services/run-event-stream-utils/service.js"
    );

    const streamPromise = streamRunEventsFromPersistence({
      req: asStreamRequest(req),
      res: asStreamResponse(res),
      runId: "run-1",
    });

    await vi.waitFor(() => {
      expect(redisSub.on).toHaveBeenCalledWith("message", expect.any(Function));
    });
    await vi.waitFor(() => {
      expect(redisSub.subscribe).toHaveBeenCalledWith("edward:run-events:run-1");
    });
    await Promise.resolve();

    const messageHandler = getMessageHandler(redisSub);

    for (let seq = 1; seq <= 2001; seq += 1) {
      messageHandler(
        "edward:run-events:run-1",
        JSON.stringify({
          id: `event-${seq}`,
          runId: "run-1",
          seq,
          eventType: "meta",
          event: { type: "meta", phase: "turn_start" },
        }),
      );
    }

    if (replayBatchResolver.current) {
      replayBatchResolver.current([]);
    }
    await streamPromise;

    expect(sendSSEDoneMock).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(redisSub.unsubscribe).toHaveBeenCalledWith("edward:run-events:run-1");
    });
  });

  it("replays from explicit last-event-id and flushes buffered live events in sequence", async () => {
    const redisSub = createRedisSubMock();
    createRedisClientMock.mockReturnValue(redisSub);

    const replayBatchResolver: {
      current: ((value: Array<unknown>) => void) | null;
    } = { current: null };
    let firstBatch = true;
    getRunEventsAfterMock.mockImplementation(() => {
      if (firstBatch) {
        firstBatch = false;
        return new Promise<Array<unknown>>((resolve) => {
          replayBatchResolver.current = resolve;
        });
      }
      return Promise.resolve([]);
    });

    const req = createReqMock();
    const res = createResMock(true);

    const { streamRunEventsFromPersistence } = await import(
      "../../../services/run-event-stream-utils/service.js"
    );

    const streamPromise = streamRunEventsFromPersistence({
      req: asStreamRequest(req),
      res: asStreamResponse(res),
      runId: "run-1",
      explicitLastEventId: "run-1:5",
    });

    await vi.waitFor(() => {
      expect(redisSub.on).toHaveBeenCalledWith("message", expect.any(Function));
      expect(getRunEventsAfterMock).toHaveBeenCalledWith("run-1", 5, 500);
    });

    const messageHandler = getMessageHandler(redisSub);

    messageHandler(
      "edward:run-events:run-1",
      JSON.stringify({
        id: "event-8",
        runId: "run-1",
        seq: 8,
        eventType: "meta",
        event: { type: "meta", phase: "turn_start" },
      }),
    );
    messageHandler(
      "edward:run-events:run-1",
      JSON.stringify({
        id: "event-7",
        runId: "run-1",
        seq: 7,
        eventType: "meta",
        event: { type: "meta", phase: "turn_start" },
      }),
    );

    if (replayBatchResolver.current) {
      replayBatchResolver.current([
        {
          id: "event-6",
          runId: "run-1",
          seq: 6,
          eventType: "meta",
          event: { type: "meta", phase: "turn_start" },
        },
      ]);
    }

    await streamPromise;

    expect(sendSSEEventWithIdMock.mock.calls.map(([_, id]) => id)).toEqual([
      "event-6",
      "event-7",
      "event-8",
    ]);
    expect(sendSSEDoneMock).toHaveBeenCalledTimes(1);
  });

  it("treats invalid last-event-id values as zero", async () => {
    const redisSub = createRedisSubMock();
    createRedisClientMock.mockReturnValue(redisSub);

    const req = createReqMock();
    req.headers["last-event-id"] = "not-a-number";
    const res = createResMock(true);

    const { streamRunEventsFromPersistence } = await import(
      "../../../services/run-event-stream-utils/service.js"
    );

    await streamRunEventsFromPersistence({
      req: asStreamRequest(req),
      res: asStreamResponse(res),
      runId: "run-1",
    });

    expect(getRunEventsAfterMock).toHaveBeenCalledWith("run-1", 0, 500);
  });
});

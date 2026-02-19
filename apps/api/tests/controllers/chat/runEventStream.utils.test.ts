import { beforeEach, describe, expect, it, vi } from "vitest";

const getRunByIdMock = vi.fn();
const getRunEventsAfterMock = vi.fn();
const getRunEventChannelMock = vi.fn();
const createRedisClientMock = vi.fn();
const configureSSEBackpressureMock = vi.fn();
const sendSSECommentMock = vi.fn();
const sendSSEDoneMock = vi.fn();
const sendSSEEventWithIdMock = vi.fn();

vi.mock("@edward/auth", () => ({
  getRunById: getRunByIdMock,
  getRunEventsAfter: getRunEventsAfterMock,
}));

vi.mock("../../../lib/redis.js", () => ({
  createRedisClient: createRedisClientMock,
}));

vi.mock("../../../services/runs/runEvents.service.js", () => ({
  getRunEventChannel: getRunEventChannelMock,
}));

vi.mock("../../../controllers/chat/sse.utils.js", () => ({
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
  return {
    query: {},
    headers: {},
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

describe("streamRunEventsFromPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRunEventChannelMock.mockReturnValue("edward:run-events:run-1");
    getRunEventsAfterMock.mockResolvedValue([]);
    getRunByIdMock.mockResolvedValue({
      id: "run-1",
      status: "completed",
    });
    sendSSEEventWithIdMock.mockReturnValue(true);
  });

  it("does not set headers when SSE has already started", async () => {
    const redisSub = createRedisSubMock();
    createRedisClientMock.mockReturnValue(redisSub);

    const req = createReqMock();
    const res = createResMock(true);

    const { streamRunEventsFromPersistence } = await import(
      "../../../controllers/chat/runEventStream.utils.js"
    );

    await streamRunEventsFromPersistence({
      req: req as never,
      res: res as never,
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
      "../../../controllers/chat/runEventStream.utils.js"
    );

    await streamRunEventsFromPersistence({
      req: req as never,
      res: res as never,
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
});

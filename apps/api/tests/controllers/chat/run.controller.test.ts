import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpStatus } from "../../../utils/constants.js";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(() => "user-1"),
  getChatIdOrRespond: vi.fn(() => "chat-1"),
  assertChatAccessOrRespond: vi.fn(async () => true),
  getRunById: vi.fn(),
  isTerminalRunStatus: vi.fn(),
  updateRun: vi.fn(async () => undefined),
  dbUpdateReturning: vi.fn(),
  redisPublish: vi.fn(async () => 1),
  sendError: vi.fn(),
  sendSuccess: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  ensureError: vi.fn((error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ),
}));

vi.mock("@edward/auth", () => ({
  and: vi.fn(),
  ACTIVE_RUN_STATUSES: ["queued", "running"],
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: mocks.dbUpdateReturning,
        })),
      })),
    })),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  },
  desc: vi.fn(),
  eq: vi.fn(),
  getRunById: mocks.getRunById,
  isTerminalRunStatus: mocks.isTerminalRunStatus,
  inArray: vi.fn(),
  RUN_STATUS: {
    CANCELLED: "cancelled",
    COMPLETED: "completed",
    FAILED: "failed",
    RUNNING: "running",
    QUEUED: "queued",
  },
  run: {
    id: "id",
    status: "status",
    state: "state",
    currentTurn: "currentTurn",
    createdAt: "createdAt",
    startedAt: "startedAt",
    userMessageId: "userMessageId",
    assistantMessageId: "assistantMessageId",
    chatId: "chatId",
    userId: "userId",
  },
  updateRun: mocks.updateRun,
}));

vi.mock("../../../lib/redis.js", () => ({
  redis: {
    publish: mocks.redisPublish,
  },
  createRedisClient: vi.fn(() => ({
    on: vi.fn(),
    subscribe: vi.fn(async () => undefined),
    unsubscribe: vi.fn(async () => undefined),
    quit: vi.fn(async () => undefined),
  })),
}));

vi.mock("../../../middleware/auth.js", () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
}));

vi.mock("../../../services/chat/access.service.js", () => ({
  assertChatAccessOrRespond: mocks.assertChatAccessOrRespond,
  getChatIdOrRespond: mocks.getChatIdOrRespond,
}));

vi.mock("../../../utils/response.js", () => ({
  sendError: mocks.sendError,
  sendSuccess: mocks.sendSuccess,
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: mocks.logger,
}));

vi.mock("../../../utils/error.js", () => ({
  ensureError: mocks.ensureError,
}));

describe("cancelRunHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbUpdateReturning.mockResolvedValue([{ id: "run-1" }]);
    mocks.getRunById.mockResolvedValue({
      id: "run-1",
      chatId: "chat-1",
      userId: "user-1",
      status: "running",
    });
    mocks.isTerminalRunStatus.mockImplementation(
      (status: string) =>
        status === "completed" || status === "failed" || status === "cancelled",
    );
  });

  it("persists cancellation even when cancel signal publish fails", async () => {
    mocks.redisPublish.mockRejectedValueOnce(new Error("redis unavailable"));
    mocks.getRunById
      .mockResolvedValueOnce({
        id: "run-1",
        chatId: "chat-1",
        userId: "user-1",
        status: "running",
      })
      .mockResolvedValueOnce({
        id: "run-1",
        chatId: "chat-1",
        userId: "user-1",
        status: "running",
      });

    const { cancelRunHandler } = await import(
      "../../../controllers/chat/query/run.controller.js"
    );

    await cancelRunHandler(
      {
        params: { chatId: "chat-1", runId: "run-1" },
      } as never,
      {} as never,
    );

    expect(mocks.dbUpdateReturning).toHaveBeenCalledTimes(1);
    expect(mocks.updateRun).not.toHaveBeenCalled();
    expect(mocks.sendSuccess).toHaveBeenCalledWith(
      expect.anything(),
      HttpStatus.OK,
      "Run cancelled",
      expect.objectContaining({
        cancelled: true,
        cancelSignalPublished: false,
      }),
    );
  });

  it("publishes cancel signal and returns acknowledged cancellation", async () => {
    mocks.getRunById
      .mockResolvedValueOnce({
        id: "run-1",
        chatId: "chat-1",
        userId: "user-1",
        status: "running",
      })
      .mockResolvedValueOnce({
        id: "run-1",
        chatId: "chat-1",
        userId: "user-1",
        status: "running",
      });

    const { cancelRunHandler } = await import(
      "../../../controllers/chat/query/run.controller.js"
    );

    await cancelRunHandler(
      {
        params: { chatId: "chat-1", runId: "run-1" },
      } as never,
      {} as never,
    );

    expect(mocks.redisPublish).toHaveBeenCalledTimes(1);
    expect(mocks.dbUpdateReturning).toHaveBeenCalledTimes(1);
    expect(mocks.updateRun).not.toHaveBeenCalled();
    expect(mocks.sendSuccess).toHaveBeenCalledWith(
      expect.anything(),
      HttpStatus.OK,
      "Run cancelled",
      expect.objectContaining({
        cancelled: true,
        cancelSignalPublished: true,
      }),
    );
  });

  it("does not publish or persist when run already terminal", async () => {
    mocks.getRunById.mockResolvedValueOnce({
      id: "run-1",
      chatId: "chat-1",
      userId: "user-1",
      status: "cancelled",
    });
    mocks.isTerminalRunStatus.mockReturnValue(true);

    const { cancelRunHandler } = await import(
      "../../../controllers/chat/query/run.controller.js"
    );

    await cancelRunHandler(
      {
        params: { chatId: "chat-1", runId: "run-1" },
      } as never,
      {} as never,
    );

    expect(mocks.redisPublish).not.toHaveBeenCalled();
    expect(mocks.dbUpdateReturning).not.toHaveBeenCalled();
    expect(mocks.updateRun).not.toHaveBeenCalled();
    expect(mocks.sendSuccess).toHaveBeenCalledWith(
      expect.anything(),
      HttpStatus.OK,
      "Run already in terminal state",
      {
        cancelled: false,
        reason: "already_terminal",
      },
    );
  });

  it("returns already-terminal if cancellation DB guard finds no active row", async () => {
    mocks.dbUpdateReturning.mockResolvedValueOnce([]);
    mocks.getRunById
      .mockResolvedValueOnce({
        id: "run-1",
        chatId: "chat-1",
        userId: "user-1",
        status: "running",
      })
      .mockResolvedValueOnce({
        id: "run-1",
        chatId: "chat-1",
        userId: "user-1",
        status: "completed",
      });
    mocks.isTerminalRunStatus.mockImplementation(
      (status: string) => status === "completed",
    );

    const { cancelRunHandler } = await import(
      "../../../controllers/chat/query/run.controller.js"
    );

    await cancelRunHandler(
      {
        params: { chatId: "chat-1", runId: "run-1" },
      } as never,
      {} as never,
    );

    expect(mocks.sendSuccess).toHaveBeenCalledWith(
      expect.anything(),
      HttpStatus.OK,
      "Run already in terminal state",
      {
        cancelled: false,
        reason: "already_terminal",
      },
    );
    expect(mocks.updateRun).not.toHaveBeenCalled();
  });

  it("returns no-op when run is non-terminal but no longer in cancellable status set", async () => {
    mocks.dbUpdateReturning.mockResolvedValueOnce([]);
    mocks.getRunById
      .mockResolvedValueOnce({
        id: "run-1",
        chatId: "chat-1",
        userId: "user-1",
        status: "running",
      })
      .mockResolvedValueOnce({
        id: "run-1",
        chatId: "chat-1",
        userId: "user-1",
        status: "running",
      })
      .mockResolvedValueOnce({
        id: "run-1",
        chatId: "chat-1",
        userId: "user-1",
        status: "paused",
      });
    mocks.isTerminalRunStatus.mockImplementation(
      (status: string) => status === "completed",
    );

    const { cancelRunHandler } = await import(
      "../../../controllers/chat/query/run.controller.js"
    );

    await cancelRunHandler(
      {
        params: { chatId: "chat-1", runId: "run-1" },
      } as never,
      {} as never,
    );

    expect(mocks.sendSuccess).toHaveBeenCalledWith(
      expect.anything(),
      HttpStatus.OK,
      "Run is not cancellable in current state",
      {
        cancelled: false,
        reason: "not_cancellable_state",
        currentStatus: "paused",
      },
    );
    expect(mocks.updateRun).not.toHaveBeenCalled();
  });
});

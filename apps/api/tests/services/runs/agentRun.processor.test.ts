import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRunById: vi.fn(),
  isTerminalRunStatus: vi.fn(),
  getLatestSessionCompleteEvent: vi.fn(),
  updateRun: vi.fn(),
  dbUpdateReturning: vi.fn(),
  createRedisClient: vi.fn(),
  runStreamSession: vi.fn(),
  getUserWithApiKey: vi.fn(),
  parseAgentRunMetadata: vi.fn(),
  decrypt: vi.fn(),
}));

vi.mock("@edward/auth", () => ({
  and: vi.fn(),
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: mocks.dbUpdateReturning,
        })),
      })),
    })),
  },
  eq: vi.fn(),
  getLatestSessionCompleteEvent: mocks.getLatestSessionCompleteEvent,
  getRunById: mocks.getRunById,
  inArray: vi.fn(),
  isTerminalRunStatus: mocks.isTerminalRunStatus,
  RUN_STATUS: {
    QUEUED: "queued",
    RUNNING: "running",
    COMPLETED: "completed",
    FAILED: "failed",
    CANCELLED: "cancelled",
  },
  run: {
    id: "id",
    status: "status",
  },
  updateRun: mocks.updateRun,
}));

vi.mock("../../../lib/redis.js", () => ({
  createRedisClient: mocks.createRedisClient,
}));

vi.mock("../../../services/chat/session/orchestrator/runStreamSession.orchestrator.js", () => ({
  runStreamSession: mocks.runStreamSession,
}));

vi.mock("../../../services/apiKey.service.js", () => ({
  getUserWithApiKey: mocks.getUserWithApiKey,
}));

vi.mock("../../../services/runs/runMetadata.js", () => ({
  parseAgentRunMetadata: mocks.parseAgentRunMetadata,
}));

vi.mock("../../../utils/encryption.js", () => ({
  decrypt: mocks.decrypt,
}));

vi.mock("../../../utils/logger.js", () => ({
  Environment: {
    Development: "development",
    Production: "production",
    Test: "test",
  },
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("processAgentRunJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRunById.mockReset();
    mocks.isTerminalRunStatus.mockReset();
    mocks.getLatestSessionCompleteEvent.mockReset();
    mocks.updateRun.mockReset();
    mocks.dbUpdateReturning.mockReset();
    mocks.createRedisClient.mockReset();
    mocks.runStreamSession.mockReset();
    mocks.getUserWithApiKey.mockReset();
    mocks.parseAgentRunMetadata.mockReset();
    mocks.decrypt.mockReset();
    mocks.getLatestSessionCompleteEvent.mockResolvedValue(null);
    mocks.dbUpdateReturning.mockResolvedValue([{ id: "run-1" }]);
    mocks.updateRun.mockResolvedValue(undefined);
    mocks.getUserWithApiKey.mockResolvedValue({ apiKey: "encrypted-key" });
    mocks.parseAgentRunMetadata.mockReturnValue({
      workflow: {},
      userContent: "hello",
      userTextContent: "hello",
      preVerifiedDeps: [],
      isFollowUp: false,
      intent: "generate",
      historyMessages: [],
      projectContext: "",
    });
    mocks.decrypt.mockReturnValue("decrypted-key");
    mocks.createRedisClient.mockReturnValue({
      subscribe: vi.fn(async () => undefined),
      on: vi.fn(),
      unsubscribe: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
    });
  });

  it("returns immediately for terminal run status", async () => {
    mocks.getRunById.mockResolvedValue({
      id: "run-1",
      status: "completed",
    });
    mocks.isTerminalRunStatus.mockImplementation(
      (status: string) => status === "completed",
    );

    const { processAgentRunJob } = await import(
      "../../../services/runs/agent-run-worker/processor.js"
    );

    await processAgentRunJob("run-1", { publish: vi.fn() });

    expect(mocks.createRedisClient).not.toHaveBeenCalled();
    expect(mocks.runStreamSession).not.toHaveBeenCalled();
  });

  it("skips execution when run cannot be transitioned from queued to running", async () => {
    const queuedRun = {
      id: "run-1",
      userId: "user-1",
      chatId: "chat-1",
      status: "queued",
      metadata: {},
      currentTurn: 0,
      userMessageId: "msg-1",
      assistantMessageId: "msg-2",
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    };
    mocks.getRunById
      .mockResolvedValueOnce(queuedRun)
      .mockResolvedValueOnce(queuedRun)
      .mockResolvedValueOnce(queuedRun);
    mocks.isTerminalRunStatus.mockReturnValue(false);
    mocks.dbUpdateReturning.mockResolvedValueOnce([]);

    const { processAgentRunJob } = await import(
      "../../../services/runs/agent-run-worker/processor.js"
    );

    await processAgentRunJob("run-1", { publish: vi.fn() });

    expect(mocks.dbUpdateReturning).toHaveBeenCalledTimes(1);
    expect(mocks.runStreamSession).not.toHaveBeenCalled();
  });
});

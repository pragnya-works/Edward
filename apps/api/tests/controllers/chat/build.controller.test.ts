import { beforeEach, describe, expect, it, vi } from "vitest";
import { BuildRecordStatus } from "@edward/shared/api/contracts";
import { HttpStatus } from "../../../utils/constants.js";

const mockRefs = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  };

  return {
    ACTIVE_RUN_STATUSES: ["queued", "running"],
    runTable: {
      id: "run-id-col",
      chatId: "run-chat-id-col",
      userId: "run-user-id-col",
      status: "run-status-col",
    },
    db: {
      select: vi.fn(() => selectChain),
    },
    selectChain,
    and: vi.fn((...args: unknown[]) => ({ args })),
    eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
    inArray: vi.fn((column: unknown, values: unknown[]) => ({ column, values })),
    getLatestBuildByChatId: vi.fn(),
    createBuild: vi.fn(),
    updateBuild: vi.fn(),
    getAuthenticatedUserId: vi.fn(() => "user-1"),
    getChatIdOrRespond: vi.fn(() => "chat-1"),
    assertChatOwnedOrRespond: vi.fn(async () => true),
    getActiveSandbox: vi.fn(),
    provisionSandbox: vi.fn(),
    hasBackup: vi.fn(),
    hasBackupOnS3: vi.fn(),
    getChatFramework: vi.fn(),
    enqueueBuildJob: vi.fn(),
    redis: {
      publish: vi.fn(async () => 1),
    },
    createRedisClient: vi.fn(() => ({
      on: vi.fn(),
      subscribe: vi.fn(async () => 1),
      unsubscribe: vi.fn(async () => 1),
      quit: vi.fn(async () => undefined),
    })),
    acquireDistributedLock: vi.fn(),
    releaseDistributedLock: vi.fn(),
    sendSuccess: vi.fn(),
    sendStandardError: vi.fn(),
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
    },
    ensureError: vi.fn((error: unknown) =>
      error instanceof Error ? error : new Error(String(error)),
    ),
  };
});

vi.mock("@edward/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@edward/auth")>();
  return {
    ...actual,
    ACTIVE_RUN_STATUSES: mockRefs.ACTIVE_RUN_STATUSES,
    run: mockRefs.runTable,
    db: mockRefs.db,
    and: mockRefs.and,
    eq: mockRefs.eq,
    inArray: mockRefs.inArray,
    getLatestBuildByChatId: mockRefs.getLatestBuildByChatId,
    createBuild: mockRefs.createBuild,
    updateBuild: mockRefs.updateBuild,
  };
});

vi.mock("../../../lib/distributedLock.js", () => ({
  acquireDistributedLock: mockRefs.acquireDistributedLock,
  releaseDistributedLock: mockRefs.releaseDistributedLock,
}));

vi.mock("../../../middleware/auth.js", () => ({
  getAuthenticatedUserId: mockRefs.getAuthenticatedUserId,
}));

vi.mock("../../../controllers/chat/access/chatAccess.service.js", () => ({
  assertChatOwnedOrRespond: mockRefs.assertChatOwnedOrRespond,
  getChatIdOrRespond: mockRefs.getChatIdOrRespond,
}));

vi.mock("../../../services/sandbox/lifecycle/provisioning.js", () => ({
  getActiveSandbox: mockRefs.getActiveSandbox,
  provisionSandbox: mockRefs.provisionSandbox,
}));

vi.mock("../../../services/sandbox/backup.service.js", () => ({
  hasBackup: mockRefs.hasBackup,
  hasBackupOnS3: mockRefs.hasBackupOnS3,
}));

vi.mock("../../../services/sandbox/state.service.js", () => ({
  getChatFramework: mockRefs.getChatFramework,
}));

vi.mock("../../../services/queue/enqueue.js", () => ({
  enqueueBuildJob: mockRefs.enqueueBuildJob,
}));

vi.mock("../../../lib/redis.js", () => ({
  redis: mockRefs.redis,
  createRedisClient: mockRefs.createRedisClient,
}));

vi.mock("../../../utils/response.js", () => ({
  sendError: mockRefs.sendStandardError,
  sendSuccess: mockRefs.sendSuccess,
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: mockRefs.logger,
}));

vi.mock("../../../utils/error.js", () => ({
  ensureError: mockRefs.ensureError,
}));

describe("build controller triggerRebuild", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRefs.selectChain.limit.mockResolvedValue([]);
    mockRefs.getLatestBuildByChatId.mockResolvedValue({
      id: "build-latest",
      messageId: "assistant-msg-1",
      status: BuildRecordStatus.SUCCESS,
      previewUrl: "https://preview.example.com",
      buildDuration: 4200,
      errorReport: null,
      createdAt: new Date().toISOString(),
    });
    mockRefs.createBuild.mockResolvedValue({
      id: "build-new",
      status: BuildRecordStatus.QUEUED,
      previewUrl: null,
      buildDuration: null,
      errorReport: null,
      createdAt: new Date().toISOString(),
    });
    mockRefs.updateBuild.mockResolvedValue(undefined);
    mockRefs.enqueueBuildJob.mockResolvedValue("job-1");
    mockRefs.acquireDistributedLock.mockResolvedValue({ key: "lock:rebuild:chat-1", id: "lock-id" });
    mockRefs.releaseDistributedLock.mockResolvedValue(undefined);
    mockRefs.getActiveSandbox.mockResolvedValue("sandbox-live");
    mockRefs.hasBackup.mockResolvedValue(false);
    mockRefs.hasBackupOnS3.mockResolvedValue(false);
    mockRefs.getChatFramework.mockResolvedValue(null);
    mockRefs.provisionSandbox.mockResolvedValue("sandbox-provisioned");
  });

  it("reprovisions and restores before rebuild when active sandbox is missing", async () => {
    mockRefs.getActiveSandbox.mockResolvedValue(undefined);
    mockRefs.getChatFramework.mockResolvedValue("nextjs");
    mockRefs.hasBackup.mockResolvedValue(false);
    mockRefs.hasBackupOnS3.mockResolvedValue(true);

    const { triggerRebuild } = await import(
      "../../../controllers/chat/query/build.controller.js"
    );
    const req = {
      params: { chatId: "chat-1" },
      userId: "user-1",
    } as never;
    const res = {} as never;

    await triggerRebuild(req, res);

    expect(mockRefs.provisionSandbox).toHaveBeenCalledWith(
      "user-1",
      "chat-1",
      "nextjs",
      true,
    );
    expect(mockRefs.enqueueBuildJob).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: "sandbox-provisioned",
        userId: "user-1",
        chatId: "chat-1",
        messageId: "assistant-msg-1",
        buildId: "build-new",
      }),
    );
    expect(mockRefs.sendSuccess).toHaveBeenCalledWith(
      res,
      HttpStatus.OK,
      "Rebuild started successfully",
      expect.any(Object),
    );
  });

  it("retries reprovisioning without framework if cached framework is invalid", async () => {
    mockRefs.getActiveSandbox.mockResolvedValue(undefined);
    mockRefs.getChatFramework.mockResolvedValue("not-a-real-framework");
    mockRefs.provisionSandbox
      .mockRejectedValueOnce(new Error("Unsupported framework"))
      .mockResolvedValueOnce("sandbox-fallback");

    const { triggerRebuild } = await import(
      "../../../controllers/chat/query/build.controller.js"
    );
    const req = {
      params: { chatId: "chat-1" },
      userId: "user-1",
    } as never;
    const res = {} as never;

    await triggerRebuild(req, res);

    expect(mockRefs.provisionSandbox).toHaveBeenNthCalledWith(
      1,
      "user-1",
      "chat-1",
      "not-a-real-framework",
      false,
    );
    expect(mockRefs.provisionSandbox).toHaveBeenNthCalledWith(
      2,
      "user-1",
      "chat-1",
      undefined,
      false,
    );
    expect(mockRefs.sendSuccess).toHaveBeenCalledWith(
      res,
      HttpStatus.OK,
      "Rebuild started successfully",
      expect.any(Object),
    );
  });
});

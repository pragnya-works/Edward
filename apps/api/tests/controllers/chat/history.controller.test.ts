import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpStatus } from "../../../utils/constants.js";

const mockRefs = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  };

  const deleteChain = {
    where: vi.fn().mockResolvedValue([]),
  };

  return {
    chatTable: {
      id: "chat_id_col",
      customSubdomain: "custom_subdomain_col",
    },
    chatRow: { customSubdomain: "custom-preview" as string | null },
    selectChain,
    deleteChain,
    db: {
      select: vi.fn(() => selectChain),
      delete: vi.fn(() => deleteChain),
    },
    getAuthenticatedUserId: vi.fn(() => "user-1"),
    getChatIdOrRespond: vi.fn(() => "chat-1"),
    assertChatAccessOrRespond: vi.fn(async () => true),
    getActiveSandbox: vi.fn(async () => "sandbox-1"),
    cleanupSandbox: vi.fn(async () => undefined),
    buildS3Key: vi.fn((userId: string, chatId: string) => `${userId}/${chatId}/`),
    deleteFolder: vi.fn(async () => undefined),
    deletePreviewSubdomain: vi.fn(async () => undefined),
    generatePreviewSubdomain: vi.fn(() => "generated-preview"),
    getDailyChatSuccessSnapshot: vi.fn(async () => ({
      limit: 10,
      current: 4,
      remaining: 6,
      resetAtMs: 1_700_000_000_000,
      isLimited: false,
    })),
    sendSuccess: vi.fn(),
    sendStreamError: vi.fn(),
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
    },
    eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
    ensureError: vi.fn((error: unknown) =>
      error instanceof Error ? error : new Error(String(error)),
    ),
  };
});

vi.mock("@edward/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@edward/auth")>();
  return {
    ...actual,
    db: mockRefs.db,
    chat: mockRefs.chatTable,
    eq: mockRefs.eq,
  };
});

vi.mock("../../../middleware/auth.js", () => ({
  getAuthenticatedUserId: mockRefs.getAuthenticatedUserId,
}));

vi.mock("../../../services/sandbox/lifecycle/provisioning.js", () => ({
  getActiveSandbox: mockRefs.getActiveSandbox,
}));

vi.mock("../../../services/sandbox/lifecycle/cleanup.js", () => ({
  cleanupSandbox: mockRefs.cleanupSandbox,
}));

vi.mock("../../../services/storage/key.utils.js", () => ({
  buildS3Key: mockRefs.buildS3Key,
}));

vi.mock("../../../services/storage.service.js", () => ({
  deleteFolder: mockRefs.deleteFolder,
}));

vi.mock("../../../services/previewRouting/registration.js", () => ({
  deletePreviewSubdomain: mockRefs.deletePreviewSubdomain,
}));

vi.mock("../../../services/previewRouting/subdomain.js", () => ({
  generatePreviewSubdomain: mockRefs.generatePreviewSubdomain,
}));

vi.mock("../../../services/rateLimit/chatDailySuccess.service.js", () => ({
  getDailyChatSuccessSnapshot: mockRefs.getDailyChatSuccessSnapshot,
}));

vi.mock("../../../utils/response.js", () => ({
  sendSuccess: mockRefs.sendSuccess,
}));

vi.mock("../../../utils/streamError.js", () => ({
  sendStreamError: mockRefs.sendStreamError,
}));

vi.mock("../../../services/chat/access.service.js", () => ({
  assertChatAccessOrRespond: mockRefs.assertChatAccessOrRespond,
  getChatIdOrRespond: mockRefs.getChatIdOrRespond,
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: mockRefs.logger,
}));

vi.mock("../../../utils/error.js", () => ({
  ensureError: mockRefs.ensureError,
}));

describe("history controller deleteChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefs.chatRow = { customSubdomain: "custom-preview" };
    mockRefs.selectChain.limit.mockResolvedValue([mockRefs.chatRow]);
    mockRefs.getActiveSandbox.mockResolvedValue("sandbox-1");
  });

  it("removes preview routing before deleting chat storage", async () => {
    const { deleteChat } = await import(
      "../../../controllers/chat/query/history.controller.js"
    );

    const req = {
      params: { chatId: "chat-1" },
      userId: "user-1",
    } as never;
    const res = {} as never;

    await deleteChat(req, res);

    expect(mockRefs.deletePreviewSubdomain).toHaveBeenCalledWith(
      "custom-preview",
      "user-1/chat-1",
    );
    expect(mockRefs.cleanupSandbox).toHaveBeenCalledWith("sandbox-1");
    expect(mockRefs.deleteFolder).toHaveBeenCalledWith("user-1/chat-1/");
    expect(mockRefs.db.delete).toHaveBeenCalledWith(mockRefs.chatTable);
    expect(mockRefs.sendSuccess).toHaveBeenCalledWith(
      res,
      HttpStatus.OK,
      "Chat deleted successfully",
    );
  });

  it("uses generated subdomain fallback and continues on routing cleanup failure", async () => {
    mockRefs.chatRow = { customSubdomain: null };
    mockRefs.selectChain.limit.mockResolvedValue([mockRefs.chatRow]);
    mockRefs.deletePreviewSubdomain.mockRejectedValueOnce(
      new Error("routing cleanup failed"),
    );

    const { deleteChat } = await import(
      "../../../controllers/chat/query/history.controller.js"
    );

    const req = {
      params: { chatId: "chat-1" },
      userId: "user-1",
    } as never;
    const res = {} as never;

    await deleteChat(req, res);

    expect(mockRefs.generatePreviewSubdomain).toHaveBeenCalledWith(
      "user-1",
      "chat-1",
    );
    expect(mockRefs.deletePreviewSubdomain).toHaveBeenCalledWith(
      "generated-preview",
      "user-1/chat-1",
    );
    expect(mockRefs.deleteFolder).toHaveBeenCalledWith("user-1/chat-1/");
    expect(mockRefs.sendSuccess).toHaveBeenCalledWith(
      res,
      HttpStatus.OK,
      "Chat deleted successfully",
    );
  });

  it("returns the authenticated user's daily chat quota snapshot", async () => {
    const { getDailyChatQuota } = await import(
      "../../../controllers/chat/query/history.controller.js"
    );

    const req = {
      userId: "user-1",
    } as never;
    const res = {} as never;

    await getDailyChatQuota(req, res);

    expect(mockRefs.getAuthenticatedUserId).toHaveBeenCalledWith(req);
    expect(mockRefs.getDailyChatSuccessSnapshot).toHaveBeenCalledWith("user-1");
    expect(mockRefs.sendSuccess).toHaveBeenCalledWith(
      res,
      HttpStatus.OK,
      "Daily chat quota retrieved successfully",
      expect.objectContaining({
        limit: 10,
        current: 4,
        remaining: 6,
        isLimited: false,
      }),
    );
  });
});

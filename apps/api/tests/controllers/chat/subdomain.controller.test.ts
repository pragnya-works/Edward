import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpStatus } from "../../../utils/constants.js";

const mockRefs = vi.hoisted(() => {
  const chatSelectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  };

  const txUpdateBuildChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };

  const txUpdateChatChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };

  const tx = {
    update: vi.fn((table: unknown) =>
      table === "build_table" ? txUpdateBuildChain : txUpdateChatChain,
    ),
    query: {
      build: {
        findFirst: vi.fn(),
      },
    },
  };

  return {
    chatData: { userId: "user-1", customSubdomain: "old-subdomain" },
    latestBuild: { id: "build-1" },
    registerResult: {
      subdomain: "new-subdomain",
      previewUrl: "https://new-subdomain.edwardd.app",
      storagePrefix: "user-1/chat-1",
    },
    availability: { available: true, reason: undefined as string | undefined },
    transactionError: null as Error | null,
    selectMock: vi.fn(() => chatSelectChain),
    tx,
    txUpdateBuildChain,
    txUpdateChatChain,
    db: {
      select: vi.fn(() => chatSelectChain),
      transaction: vi.fn(async (callback: (value: typeof tx) => Promise<void>) => {
        if (mockRefs.transactionError) {
          throw mockRefs.transactionError;
        }
        await callback(tx);
      }),
    },
    sendError: vi.fn(),
    sendSuccess: vi.fn(),
    getAuthenticatedUserId: vi.fn(() => "user-1"),
    checkSubdomainAvailability: vi.fn(async () => mockRefs.availability),
    registerPreviewSubdomain: vi.fn(async () => mockRefs.registerResult),
    deletePreviewSubdomain: vi.fn(async () => undefined),
    generatePreviewSubdomain: vi.fn(() => "generated-subdomain"),
    buildSubdomainPreviewUrl: vi.fn((subdomain: string) => `https://${subdomain}.edwardd.app`),
    buildS3Key: vi.fn((userId: string, chatId: string) => `${userId}/${chatId}/`),
    ensureError: vi.fn((error: unknown) =>
      error instanceof Error ? error : new Error(String(error)),
    ),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock("@edward/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@edward/auth")>();
  return {
    ...actual,
    db: mockRefs.db,
    chat: {
      id: "chat_id_col",
      userId: "chat_user_id_col",
      customSubdomain: "chat_custom_subdomain_col",
    },
    build: {
      id: "build_id_col",
      chatId: "build_chat_id_col",
      createdAt: "build_created_at_col",
    },
    eq: vi.fn(() => "eq"),
    desc: vi.fn(() => "desc"),
  };
});

vi.mock("../../../middleware/auth.js", () => ({
  getAuthenticatedUserId: mockRefs.getAuthenticatedUserId,
}));

vi.mock("../../../utils/response.js", () => ({
  sendError: mockRefs.sendError,
  sendSuccess: mockRefs.sendSuccess,
}));

vi.mock("../../../utils/error.js", () => ({
  ensureError: mockRefs.ensureError,
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: mockRefs.logger,
}));

vi.mock("../../../services/previewRouting.service.js", () => ({
  checkSubdomainAvailability: mockRefs.checkSubdomainAvailability,
  registerPreviewSubdomain: mockRefs.registerPreviewSubdomain,
  deletePreviewSubdomain: mockRefs.deletePreviewSubdomain,
  generatePreviewSubdomain: mockRefs.generatePreviewSubdomain,
}));

vi.mock("../../../services/preview.service.js", () => ({
  buildSubdomainPreviewUrl: mockRefs.buildSubdomainPreviewUrl,
}));

vi.mock("../../../services/storage/key.utils.js", () => ({
  buildS3Key: mockRefs.buildS3Key,
}));

vi.mock("../../../config.js", () => ({
  DEPLOYMENT_TYPES: {
    PATH: "path",
    SUBDOMAIN: "subdomain",
  },
  config: {
    deployment: { type: "subdomain" },
  },
}));

describe("updateChatSubdomainHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefs.chatData = { userId: "user-1", customSubdomain: "old-subdomain" };
    mockRefs.latestBuild = { id: "build-1" };
    mockRefs.registerResult = {
      subdomain: "new-subdomain",
      previewUrl: "https://new-subdomain.edwardd.app",
      storagePrefix: "user-1/chat-1",
    };
    mockRefs.availability = { available: true, reason: undefined };
    mockRefs.transactionError = null;
    mockRefs.tx.query.build.findFirst.mockResolvedValue(mockRefs.latestBuild);
    mockRefs.txUpdateBuildChain.where.mockResolvedValue(undefined);
    mockRefs.txUpdateChatChain.where.mockResolvedValue(undefined);

    mockRefs.db.select.mockImplementation(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockRefs.chatData]),
    }));
  });

  it("commits DB updates before routing registration, then removes old routing", async () => {
    const { updateChatSubdomainHandler } = await import(
      "../../../controllers/chat/subdomain.controller.js"
    );

    const req = {
      params: { chatId: "chat-1" },
      body: { subdomain: "new-subdomain" },
      userId: "user-1",
    } as never;

    const res = {} as never;

    await updateChatSubdomainHandler(req, res);

    expect(mockRefs.registerPreviewSubdomain).toHaveBeenCalledWith(
      "user-1",
      "chat-1",
      "new-subdomain",
    );
    expect(mockRefs.checkSubdomainAvailability).toHaveBeenCalledWith(
      "new-subdomain",
      "chat-1",
      "user-1/chat-1",
    );
    expect(mockRefs.db.transaction).toHaveBeenCalledTimes(1);
    expect(
      mockRefs.db.transaction.mock.invocationCallOrder[0]!,
    ).toBeLessThan(mockRefs.registerPreviewSubdomain.mock.invocationCallOrder[0]!);
    expect(mockRefs.deletePreviewSubdomain).toHaveBeenCalledWith(
      "old-subdomain",
      "user-1/chat-1",
    );
    expect(mockRefs.sendSuccess).toHaveBeenCalledWith(
      res,
      HttpStatus.OK,
      "Subdomain updated successfully",
      expect.objectContaining({
        subdomain: "new-subdomain",
        previewUrl: "https://new-subdomain.edwardd.app",
      }),
    );
  });

  it("does not register routing when DB transaction fails", async () => {
    mockRefs.transactionError = new Error("db write failed");

    const { updateChatSubdomainHandler } = await import(
      "../../../controllers/chat/subdomain.controller.js"
    );

    const req = {
      params: { chatId: "chat-1" },
      body: { subdomain: "new-subdomain" },
      userId: "user-1",
    } as never;

    const res = {} as never;

    await updateChatSubdomainHandler(req, res);

    expect(mockRefs.registerPreviewSubdomain).not.toHaveBeenCalled();
    expect(mockRefs.deletePreviewSubdomain).not.toHaveBeenCalled();
    expect(mockRefs.sendError).toHaveBeenCalledWith(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      expect.any(String),
    );
  });

  it("rolls back DB updates when routing registration fails", async () => {
    mockRefs.registerPreviewSubdomain.mockRejectedValueOnce(
      new Error("kv upsert failed"),
    );

    const { updateChatSubdomainHandler } = await import(
      "../../../controllers/chat/subdomain.controller.js"
    );

    const req = {
      params: { chatId: "chat-1" },
      body: { subdomain: "new-subdomain" },
      userId: "user-1",
    } as never;

    const res = {} as never;

    await updateChatSubdomainHandler(req, res);

    expect(mockRefs.db.transaction).toHaveBeenCalledTimes(2);
    expect(mockRefs.txUpdateChatChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ customSubdomain: "new-subdomain" }),
    );
    expect(mockRefs.txUpdateChatChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ customSubdomain: "old-subdomain" }),
    );
    expect(mockRefs.deletePreviewSubdomain).not.toHaveBeenCalled();
    expect(mockRefs.sendError).toHaveBeenCalledWith(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      expect.any(String),
    );
  });
});

describe("checkSubdomainAvailabilityHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefs.chatData = { userId: "user-1", customSubdomain: "old-subdomain" };
    mockRefs.availability = { available: true, reason: undefined };
    mockRefs.db.select.mockImplementation(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockRefs.chatData]),
    }));
  });

  it("validates chat ownership before checking availability", async () => {
    const { checkSubdomainAvailabilityHandler } = await import(
      "../../../controllers/chat/subdomain.controller.js"
    );

    const req = {
      query: { subdomain: "new-subdomain", chatId: "chat-1" },
      userId: "user-1",
    } as never;
    const res = {} as never;

    await checkSubdomainAvailabilityHandler(req, res);

    expect(mockRefs.checkSubdomainAvailability).toHaveBeenCalledWith(
      "new-subdomain",
      "chat-1",
      "user-1/chat-1",
    );
    expect(mockRefs.sendSuccess).toHaveBeenCalledWith(
      res,
      HttpStatus.OK,
      "Availability checked",
      expect.objectContaining({
        subdomain: "new-subdomain",
        available: true,
      }),
    );
  });

  it("returns forbidden when requester does not own chat", async () => {
    mockRefs.chatData = { userId: "user-2", customSubdomain: "old-subdomain" };
    mockRefs.db.select.mockImplementation(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockRefs.chatData]),
    }));

    const { checkSubdomainAvailabilityHandler } = await import(
      "../../../controllers/chat/subdomain.controller.js"
    );

    const req = {
      query: { subdomain: "new-subdomain", chatId: "chat-1" },
      userId: "user-1",
    } as never;
    const res = {} as never;

    await checkSubdomainAvailabilityHandler(req, res);

    expect(mockRefs.checkSubdomainAvailability).not.toHaveBeenCalled();
    expect(mockRefs.sendError).toHaveBeenCalledWith(
      res,
      HttpStatus.FORBIDDEN,
      expect.any(String),
    );
  });
});

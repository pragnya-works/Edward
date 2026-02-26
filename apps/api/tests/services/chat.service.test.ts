import { describe, it, expect, vi, beforeEach } from "vitest";
import { db, MessageRole } from "@edward/auth";
import {
  getOrCreateChat,
  saveMessage,
  updateChatMeta,
} from "../../services/chat.service.js";

type MockFn = ReturnType<typeof vi.fn>;

interface MockedDb {
  select: MockFn;
  from: MockFn;
  where: MockFn;
  limit: MockFn;
  insert: MockFn;
  update: MockFn;
}

vi.mock("@edward/auth", async () => {
  const actual =
    await vi.importActual<typeof import("@edward/auth")>("@edward/auth");
  return {
    ...actual,
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue([]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    },
    chat: { id: "chat_id" },
    message: { id: "message_id" },
    MessageRole: {
      System: "system",
      User: "user",
      Assistant: "assistant",
      Data: "data",
    },
    eq: vi.fn(),
  };
});

vi.mock("nanoid", () => ({
  nanoid: vi.fn().mockReturnValue("mock-nanoid-32chars-long-id"),
}));

describe("chat service", () => {
  const mockUserId = "user-123";
  const mockChatId = "chat-456";
  const mockedDb = db as unknown as MockedDb;
  let updateSetMock: MockFn;
  let updateWhereMock: MockFn;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(mockedDb.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
      }),
    });

    updateWhereMock = vi.fn().mockResolvedValue([]);
    updateSetMock = vi.fn().mockReturnValue({
      where: updateWhereMock,
    });
    vi.mocked(mockedDb.update).mockReturnValue({
      set: updateSetMock,
    });
  });

  describe("getOrCreateChat", () => {
    it("should create new chat when chatId is not provided", async () => {
      const result = await getOrCreateChat(mockUserId, undefined, {
        title: "New Chat",
        description: "Test description",
        visibility: true,
      });

      expect(result.chatId).toBeDefined();
      expect(result.isNewChat).toBe(true);
      expect(result.error).toBeUndefined();
      expect(vi.mocked(mockedDb.insert)).toHaveBeenCalledWith(expect.anything());
      const insertValues = vi
        .mocked(mockedDb.insert)
        .mock.results[0]?.value.values as MockFn;
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "New Chat",
          description: "Test description",
          seoTitle: "New Chat",
          seoDescription: "Test description",
        }),
      );
    });

    it("should create new chat with default values", async () => {
      const result = await getOrCreateChat(mockUserId, undefined, {});

      expect(result.isNewChat).toBe(true);
    });

    it("retries chat creation without seo fields when db is missing seo columns", async () => {
      const insertValuesMock = vi
        .fn()
        .mockRejectedValueOnce(
          new Error('column "seo_title" does not exist'),
        )
        .mockResolvedValueOnce([]);

      vi.mocked(mockedDb.insert).mockReturnValue({
        values: insertValuesMock,
      });

      const result = await getOrCreateChat(mockUserId, undefined, {
        title: "Fallback Chat",
      });

      expect(result.isNewChat).toBe(true);
      expect(insertValuesMock).toHaveBeenCalledTimes(2);
      expect(insertValuesMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          seoTitle: "Fallback Chat",
        }),
      );
      expect(insertValuesMock).toHaveBeenNthCalledWith(
        2,
        expect.not.objectContaining({
          seoTitle: expect.anything(),
        }),
      );
    });

    it("should return existing chat when chatId provided and user owns it", async () => {
      vi.mocked(mockedDb.limit).mockResolvedValue([{ userId: mockUserId }]);

      const result = await getOrCreateChat(mockUserId, mockChatId, {});

      expect(result.chatId).toBe(mockChatId);
      expect(result.isNewChat).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it("should return 404 error when chat not found", async () => {
      vi.mocked(mockedDb.limit).mockResolvedValue([]);

      const result = await getOrCreateChat(mockUserId, mockChatId, {});

      expect(result.error).toBe("Chat not found");
      expect(result.status).toBe(404);
    });

    it("should return 403 error when user does not own chat", async () => {
      vi.mocked(mockedDb.limit).mockResolvedValue([
        { userId: "different-user" },
      ]);

      const result = await getOrCreateChat(mockUserId, mockChatId, {});

      expect(result.error).toBe("Forbidden");
      expect(result.status).toBe(403);
    });

    it("should return 500 error on database error", async () => {
      vi.mocked(mockedDb.limit).mockRejectedValue(new Error("DB error"));

      const result = await getOrCreateChat(mockUserId, mockChatId, {});

      expect(result.error).toBe("Internal service error during chat operation");
      expect(result.status).toBe(500);
    });
  });

  describe("saveMessage", () => {
    it("should save user message and return message ID", async () => {
      const result = await saveMessage(
        mockChatId,
        mockUserId,
        MessageRole.User,
        "Hello",
      );

      expect(result).toBe("mock-nanoid-32chars-long-id");
    });

    it("should save assistant message", async () => {
      const result = await saveMessage(
        mockChatId,
        mockUserId,
        MessageRole.Assistant,
        "Response",
      );

      expect(result).toBe("mock-nanoid-32chars-long-id");
    });

    it("should use provided message ID", async () => {
      const customId = "custom-message-id";

      const result = await saveMessage(
        mockChatId,
        mockUserId,
        MessageRole.User,
        "Hello",
        customId,
      );

      expect(result).toBe(customId);
    });

    it("should handle database error", async () => {
      vi.mocked(mockedDb.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockRejectedValue(new Error("DB error")),
        }),
      });

      await expect(
        saveMessage(mockChatId, mockUserId, MessageRole.User, "Hello"),
      ).rejects.toThrow("Failed to save message to database");
    });
  });

  describe("updateChatMeta", () => {
    it("mirrors title and description into seo fields in one update", async () => {
      await updateChatMeta(mockChatId, {
        title: "Landing Page Builder",
        description: "Create and iterate web pages with AI assistance",
      });

      expect(vi.mocked(mockedDb.update)).toHaveBeenCalledWith(expect.anything());
      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Landing Page Builder",
          description: "Create and iterate web pages with AI assistance",
          seoTitle: "Landing Page Builder",
          seoDescription: "Create and iterate web pages with AI assistance",
        }),
      );
      expect(updateWhereMock).toHaveBeenCalled();
    });

    it("accepts explicit seo fields when provided", async () => {
      await updateChatMeta(mockChatId, {
        title: "Landing Page Builder",
        seoTitle: "Best AI Landing Page Builder",
      });

      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Landing Page Builder",
          seoTitle: "Best AI Landing Page Builder",
        }),
      );
    });

    it("retries metadata update without seo fields when seo columns are missing", async () => {
      updateSetMock
        .mockReturnValueOnce({
          where: vi
            .fn()
            .mockRejectedValue(new Error('column "seo_title" does not exist')),
        })
        .mockReturnValueOnce({ where: updateWhereMock });

      await updateChatMeta(mockChatId, {
        title: "Fallback Title",
        description: "Fallback Description",
      });

      expect(updateSetMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          title: "Fallback Title",
          description: "Fallback Description",
        }),
      );
      expect(updateSetMock).toHaveBeenNthCalledWith(
        2,
        expect.not.objectContaining({
          seoTitle: expect.anything(),
          seoDescription: expect.anything(),
        }),
      );
    });
  });
});

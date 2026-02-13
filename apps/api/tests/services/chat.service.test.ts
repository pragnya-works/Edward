import { describe, it, expect, vi, beforeEach, Mocked } from "vitest";
import { db, MessageRole } from "@edward/auth";
import { getOrCreateChat, saveMessage } from "../../services/chat.service.js";

interface MockedDb {
  select: Mocked<() => MockedDb>;
  from: Mocked<() => MockedDb>;
  where: Mocked<() => MockedDb>;
  limit: Mocked<(n: number) => Promise<unknown[]>>;
  insert: Mocked<
    () => {
      values: Mocked<
        () => { onConflictDoUpdate: Mocked<() => Promise<unknown[]>> }
      >;
    }
  >;
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

  beforeEach(() => {
    vi.clearAllMocks();
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
    });

    it("should create new chat with default values", async () => {
      const result = await getOrCreateChat(mockUserId, undefined, {});

      expect(result.isNewChat).toBe(true);
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
});

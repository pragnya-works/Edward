import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, MessageRole } from '@edward/auth';
import {
  getOrCreateChat,
  saveMessage,
} from '../../services/chat.service.js';


vi.mock('@edward/auth', async () => {
  const actual = await vi.importActual<typeof import('@edward/auth')>('@edward/auth');
  return {
    ...actual,
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue([]),
    },
    chat: {},
    message: {},
    MessageRole: {
      System: 'system',
      User: 'user',
      Assistant: 'assistant',
      Data: 'data',
    },
    eq: vi.fn(),
  };
});



vi.mock('nanoid', () => ({
  nanoid: vi.fn().mockReturnValue('mock-nanoid-32chars-long-id'),
}));

describe('chat service', () => {
  const mockUserId = 'user-123';
  const mockChatId = 'chat-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrCreateChat', () => {
    it('should create new chat when chatId is not provided', async () => {
      vi.mocked(db.values).mockResolvedValue([]);

      const result = await getOrCreateChat(mockUserId, undefined, {
        title: 'New Chat',
        description: 'Test description',
        visibility: true,
      });

      expect(result.chatId).toBeDefined();
      expect(result.isNewChat).toBe(true);
      expect(result.error).toBeUndefined();
      expect(db.insert).toHaveBeenCalled();
    });

    it('should create new chat with default values', async () => {
      vi.mocked(db.values).mockResolvedValue([]);

      const result = await getOrCreateChat(mockUserId, undefined, {});

      expect(result.isNewChat).toBe(true);
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Chat',
          visibility: false,
        })
      );
    });

    it('should return existing chat when chatId provided and user owns it', async () => {
      vi.mocked(db.limit).mockResolvedValue([{ userId: mockUserId }]);

      const result = await getOrCreateChat(mockUserId, mockChatId, {});

      expect(result.chatId).toBe(mockChatId);
      expect(result.isNewChat).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should return 404 error when chat not found', async () => {
      vi.mocked(db.limit).mockResolvedValue([]);

      const result = await getOrCreateChat(mockUserId, mockChatId, {});

      expect(result.error).toBe('Chat not found');
      expect(result.status).toBe(404);
    });

    it('should return 403 error when user does not own chat', async () => {
      vi.mocked(db.limit).mockResolvedValue([{ userId: 'different-user' }]);

      const result = await getOrCreateChat(mockUserId, mockChatId, {});

      expect(result.error).toBe('Forbidden');
      expect(result.status).toBe(403);
    });

    it('should return 500 error on database error', async () => {
      vi.mocked(db.limit).mockRejectedValue(new Error('DB error'));

      const result = await getOrCreateChat(mockUserId, mockChatId, {});

      expect(result.error).toBe('Internal service error during chat operation');
      expect(result.status).toBe(500);
    });
  });

  describe('saveMessage', () => {
    it('should save user message and return message ID', async () => {
      vi.mocked(db.values).mockResolvedValue([]);

      const result = await saveMessage(mockChatId, mockUserId, MessageRole.User, 'Hello');

      expect(result).toBe('mock-nanoid-32chars-long-id');
      expect(db.insert).toHaveBeenCalled();
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: mockChatId,
          userId: mockUserId,
          role: MessageRole.User,
          content: 'Hello',
        })
      );
    });

    it('should save assistant message', async () => {
      vi.mocked(db.values).mockResolvedValue([]);

      await saveMessage(mockChatId, mockUserId, MessageRole.Assistant, 'Response');

      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          role: MessageRole.Assistant,
          content: 'Response',
        })
      );
    });

    it('should use provided message ID', async () => {
      vi.mocked(db.values).mockResolvedValue([]);
      const customId = 'custom-message-id';

      const result = await saveMessage(mockChatId, mockUserId, MessageRole.User, 'Hello', customId);

      expect(result).toBe(customId);
    });

    it('should throw error when database insert fails', async () => {
      vi.mocked(db.values).mockRejectedValue(new Error('Insert failed'));

      await expect(
        saveMessage(mockChatId, mockUserId, MessageRole.User, 'Hello')
      ).rejects.toThrow('Failed to save message to database');
    });
  });
});

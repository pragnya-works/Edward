import { describe, it, expect } from 'vitest';
import {
  StreamState,
  ParserEventType,
  ChatIdParamSchema,
  UnifiedSendMessageSchema,
  UnifiedSendMessageRequestSchema,
  GetChatHistoryRequestSchema,
  ParserEventSchema,
} from '../../schemas/chat.schema.js';

describe('chat schemas', () => {
  describe('StreamState enum', () => {
    it('should have all stream states', () => {
      expect(StreamState.TEXT).toBe('TEXT');
      expect(StreamState.THINKING).toBe('THINKING');
      expect(StreamState.SANDBOX).toBe('SANDBOX');
      expect(StreamState.FILE).toBe('FILE');
    });
  });

  describe('ParserEventType enum', () => {
    it('should have all parser event types', () => {
      expect(ParserEventType.TEXT).toBe('text');
      expect(ParserEventType.THINKING_START).toBe('thinking_start');
      expect(ParserEventType.THINKING_CONTENT).toBe('thinking_content');
      expect(ParserEventType.THINKING_END).toBe('thinking_end');
      expect(ParserEventType.SANDBOX_START).toBe('sandbox_start');
      expect(ParserEventType.SANDBOX_END).toBe('sandbox_end');
      expect(ParserEventType.FILE_START).toBe('file_start');
      expect(ParserEventType.FILE_CONTENT).toBe('file_content');
      expect(ParserEventType.FILE_END).toBe('file_end');
      expect(ParserEventType.ERROR).toBe('error');
      expect(ParserEventType.META).toBe('meta');
    });
  });

  describe('ChatIdParamSchema', () => {
    it('should validate valid chat ID', () => {
      const result = ChatIdParamSchema.safeParse({
        chatId: 'valid-chat-id-123',
      });

      expect(result.success).toBe(true);
    });

    it('should reject empty chat ID', () => {
      const result = ChatIdParamSchema.safeParse({
        chatId: '',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing chatId', () => {
      const result = ChatIdParamSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe('UnifiedSendMessageSchema', () => {
    it('should validate valid message', () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: 'Hello, world!',
      });

      expect(result.success).toBe(true);
    });

    it('should validate message with all fields', () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: 'Test message',
        chatId: 'chat-123',
        title: 'Test Chat',
        description: 'A test chat',
        visibility: true,
      });

      expect(result.success).toBe(true);
    });

    it('should reject empty content', () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: '',
      });

      expect(result.success).toBe(false);
    });

    it('should accept whitespace-only content (schema level only)', () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: '   ',
      });

      expect(result.success).toBe(true);
    });

    it('should reject missing content', () => {
      const result = UnifiedSendMessageSchema.safeParse({
        chatId: 'chat-123',
      });

      expect(result.success).toBe(false);
    });

    it('should accept message without optional fields', () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: 'Just content',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.chatId).toBeUndefined();
        expect(result.data.title).toBeUndefined();
        expect(result.data.description).toBeUndefined();
        expect(result.data.visibility).toBeUndefined();
      }
    });
  });

  describe('UnifiedSendMessageRequestSchema', () => {
    it('should validate valid request', () => {
      const result = UnifiedSendMessageRequestSchema.safeParse({
        body: {
          content: 'Hello!',
          chatId: 'chat-123',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid body', () => {
      const result = UnifiedSendMessageRequestSchema.safeParse({
        body: {
          content: '',
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('GetChatHistoryRequestSchema', () => {
    it('should validate valid request', () => {
      const result = GetChatHistoryRequestSchema.safeParse({
        params: {
          chatId: 'chat-history-123',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid params', () => {
      const result = GetChatHistoryRequestSchema.safeParse({
        params: {
          chatId: '',
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('ParserEventSchema', () => {
    it('should validate TEXT event', () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.TEXT,
        content: 'Some text content',
      });

      expect(result.success).toBe(true);
    });

    it('should validate THINKING_START event', () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.THINKING_START,
      });

      expect(result.success).toBe(true);
    });

    it('should validate THINKING_CONTENT event', () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.THINKING_CONTENT,
        content: 'Thinking...',
      });

      expect(result.success).toBe(true);
    });

    it('should validate THINKING_END event', () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.THINKING_END,
      });

      expect(result.success).toBe(true);
    });

    it('should validate SANDBOX_START event with project', () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.SANDBOX_START,
        project: 'my-project',
        base: 'main',
      });

      expect(result.success).toBe(true);
    });

    it('should validate SANDBOX_START event without optional fields', () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.SANDBOX_START,
      });

      expect(result.success).toBe(true);
    });

    it('should validate SANDBOX_END event', () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.SANDBOX_END,
      });

      expect(result.success).toBe(true);
    });

    it('should validate FILE_START event', () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.FILE_START,
        path: '/path/to/file.ts',
      });

      expect(result.success).toBe(true);
    });

    it('should validate FILE_CONTENT event', () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.FILE_CONTENT,
        content: 'file content',
      });

      expect(result.success).toBe(true);
    });

    it('should validate FILE_END event', () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.FILE_END,
      });

      expect(result.success).toBe(true);
    });

    it('should validate ERROR event', () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.ERROR,
        message: 'Something went wrong',
      });

      expect(result.success).toBe(true);
    });

    it('should validate META event', () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.META,
        chatId: 'chat-123',
        userMessageId: 'msg-1',
        assistantMessageId: 'msg-2',
        isNewChat: true,
      });

      expect(result.success).toBe(true);
    });

    it('should reject unknown event type', () => {
      const result = ParserEventSchema.safeParse({
        type: 'unknown_type',
        content: 'test',
      });

      expect(result.success).toBe(false);
    });

    it('should reject TEXT event without content', () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.TEXT,
      });

      expect(result.success).toBe(false);
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  ParserEventType,
  ChatIdParamSchema,
  UnifiedSendMessageSchema,
  UnifiedSendMessageRequestSchema,
  GetChatHistoryRequestSchema,
  ParserEventSchema,
} from "../../schemas/chat.schema.js";

const validJpegBase64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

describe("chat schemas", () => {
  describe("ChatIdParamSchema", () => {
    it("should validate valid chat ID", () => {
      const result = ChatIdParamSchema.safeParse({
        chatId: "valid-chat-id-123",
      });

      expect(result.success).toBe(true);
    });

    it("should reject empty chat ID", () => {
      const result = ChatIdParamSchema.safeParse({
        chatId: "",
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing chatId", () => {
      const result = ChatIdParamSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe("UnifiedSendMessageSchema", () => {
    it("should validate valid message", () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: "Hello, world!",
      });

      expect(result.success).toBe(true);
    });

    it("should validate message with all fields", () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: "Test message",
        chatId: "chat-123",
        title: "Test Chat",
        description: "A test chat",
        visibility: true,
      });

      expect(result.success).toBe(true);
    });

    it("should reject empty content", () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: "",
      });

      expect(result.success).toBe(false);
    });

    it("should accept whitespace-only content (schema level only)", () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: "   ",
      });

      expect(result.success).toBe(true);
    });

    it("should reject missing content", () => {
      const result = UnifiedSendMessageSchema.safeParse({
        chatId: "chat-123",
      });

      expect(result.success).toBe(false);
    });

    it("should accept message without optional fields", () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: "Just content",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.chatId).toBeUndefined();
        expect(result.data.title).toBeUndefined();
        expect(result.data.description).toBeUndefined();
        expect(result.data.visibility).toBeUndefined();
      }
    });

    it("should validate multimodal content with text and image", () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: [
          { type: "text", text: "What is in this image?" },
          { type: "image", base64: validJpegBase64, mimeType: "image/jpeg" },
        ],
      });

      expect(result.success).toBe(true);
    });

    it("should validate multimodal content with image only", () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: [
          { type: "image", base64: validJpegBase64, mimeType: "image/jpeg" },
        ],
      });

      expect(result.success).toBe(true);
    });

    it("should reject multimodal content with more than 3 images", () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: [
          { type: "image", base64: validJpegBase64, mimeType: "image/jpeg" },
          { type: "image", base64: validJpegBase64, mimeType: "image/jpeg" },
          { type: "image", base64: validJpegBase64, mimeType: "image/jpeg" },
          { type: "image", base64: validJpegBase64, mimeType: "image/jpeg" },
        ],
      });

      expect(result.success).toBe(false);
    });

    it("should reject multimodal content with invalid mime type", () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: [
          { type: "image", base64: validJpegBase64, mimeType: "image/bmp" },
        ],
      });

      expect(result.success).toBe(false);
    });

    it("should reject empty multimodal content array", () => {
      const result = UnifiedSendMessageSchema.safeParse({
        content: [],
      });

      expect(result.success).toBe(false);
    });
  });

  describe("UnifiedSendMessageRequestSchema", () => {
    it("should validate valid request", () => {
      const result = UnifiedSendMessageRequestSchema.safeParse({
        body: {
          content: "Hello!",
          chatId: "chat-123",
        },
      });

      expect(result.success).toBe(true);
    });

    it("should reject invalid body", () => {
      const result = UnifiedSendMessageRequestSchema.safeParse({
        body: {
          content: "",
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe("GetChatHistoryRequestSchema", () => {
    it("should validate valid request", () => {
      const result = GetChatHistoryRequestSchema.safeParse({
        params: {
          chatId: "chat-history-123",
        },
      });

      expect(result.success).toBe(true);
    });

    it("should reject invalid params", () => {
      const result = GetChatHistoryRequestSchema.safeParse({
        params: {
          chatId: "",
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe("ParserEventSchema", () => {
    it("should validate TEXT event", () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.TEXT,
        content: "Some text content",
      });

      expect(result.success).toBe(true);
    });

    it("should validate THINKING_START event", () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.THINKING_START,
      });

      expect(result.success).toBe(true);
    });

    it("should validate THINKING_CONTENT event", () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.THINKING_CONTENT,
        content: "Thinking...",
      });

      expect(result.success).toBe(true);
    });

    it("should validate THINKING_END event", () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.THINKING_END,
      });

      expect(result.success).toBe(true);
    });

    it("should validate SANDBOX_START event with project", () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.SANDBOX_START,
        project: "my-project",
        base: "main",
      });

      expect(result.success).toBe(true);
    });

    it("should validate SANDBOX_START event without optional fields", () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.SANDBOX_START,
      });

      expect(result.success).toBe(true);
    });

    it("should validate SANDBOX_END event", () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.SANDBOX_END,
      });

      expect(result.success).toBe(true);
    });

    it("should validate FILE_START event", () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.FILE_START,
        path: "/path/to/file.ts",
      });

      expect(result.success).toBe(true);
    });

    it("should validate FILE_CONTENT event", () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.FILE_CONTENT,
        content: "file content",
      });

      expect(result.success).toBe(true);
    });

    it("should validate FILE_END event", () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.FILE_END,
      });

      expect(result.success).toBe(true);
    });

    it("should validate ERROR event", () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.ERROR,
        message: "Something went wrong",
      });

      expect(result.success).toBe(true);
    });

    it("should validate META event", () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.META,
        chatId: "chat-123",
        userMessageId: "msg-1",
        assistantMessageId: "msg-2",
        isNewChat: true,
      });

      expect(result.success).toBe(true);
    });

    it("should reject unknown event type", () => {
      const result = ParserEventSchema.safeParse({
        type: "unknown_type",
        content: "test",
      });

      expect(result.success).toBe(false);
    });

    it("should reject TEXT event without content", () => {
      const result = ParserEventSchema.safeParse({
        type: ParserEventType.TEXT,
      });

      expect(result.success).toBe(false);
    });
  });
});

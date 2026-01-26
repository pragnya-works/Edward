import { z } from 'zod';

export enum StreamState {
  TEXT = 'TEXT',
  THINKING = 'THINKING',
  SANDBOX = 'SANDBOX',
  FILE = 'FILE',
}

export enum ParserEventType {
  TEXT = 'text',
  THINKING_START = 'thinking_start',
  THINKING_CONTENT = 'thinking_content',
  THINKING_END = 'thinking_end',
  SANDBOX_START = 'sandbox_start',
  SANDBOX_END = 'sandbox_end',
  FILE_START = 'file_start',
  FILE_CONTENT = 'file_content',
  FILE_END = 'file_end',
  ERROR = 'error',
  META = 'meta',
}

export const ChatIdParamSchema = z.object({
  chatId: z.string().min(1, 'Chat ID is required'),
});

export const UnifiedSendMessageSchema = z.object({
  content: z.string().min(1, 'Message content cannot be empty'),
  chatId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  visibility: z.boolean().optional(),
});

export const UnifiedSendMessageRequestSchema = z.object({
  body: UnifiedSendMessageSchema,
});

export const GetChatHistoryRequestSchema = z.object({
  params: ChatIdParamSchema,
});

export const ParserEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(ParserEventType.TEXT), content: z.string() }),
  z.object({ type: z.literal(ParserEventType.THINKING_START) }),
  z.object({ type: z.literal(ParserEventType.THINKING_CONTENT), content: z.string() }),
  z.object({ type: z.literal(ParserEventType.THINKING_END) }),
  z.object({ type: z.literal(ParserEventType.SANDBOX_START), project: z.string().optional(), base: z.string().optional() }),
  z.object({ type: z.literal(ParserEventType.SANDBOX_END) }),
  z.object({ type: z.literal(ParserEventType.FILE_START), path: z.string() }),
  z.object({ type: z.literal(ParserEventType.FILE_CONTENT), content: z.string() }),
  z.object({ type: z.literal(ParserEventType.FILE_END) }),
  z.object({ type: z.literal(ParserEventType.ERROR), message: z.string() }),
  z.object({ type: z.literal(ParserEventType.META), chatId: z.string(), userMessageId: z.string(), assistantMessageId: z.string(), isNewChat: z.boolean() }),
]);

export type ParserEvent = z.infer<typeof ParserEventSchema>;


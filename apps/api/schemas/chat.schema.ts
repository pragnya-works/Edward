import { z } from 'zod';

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


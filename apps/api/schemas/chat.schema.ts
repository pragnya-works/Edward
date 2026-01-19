import { z } from 'zod';

export const CreateChatSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  visibility: z.boolean().optional(),
});

export const SendMessageSchema = z.object({
  content: z.string().min(1, 'Message content cannot be empty'),
  role: z.enum(['user', 'assistant', 'system', 'data']).default('user'),
});

export const ChatIdParamSchema = z.object({
  chatId: z.string().min(1, 'Chat ID is required'),
});

export const CreateChatRequestSchema = z.object({
  body: CreateChatSchema,
});

export const SendMessageRequestSchema = z.object({
  body: SendMessageSchema,
  params: ChatIdParamSchema,
});

export const GetChatHistoryRequestSchema = z.object({
  params: ChatIdParamSchema,
});

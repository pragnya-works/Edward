import { z } from 'zod';
import { PlanSchema } from '../services/planning/schemas.js';

export const NPM_PACKAGE_REGEX = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;
export const MAX_DEPENDENCIES = 50;
export const MAX_PACKAGE_NAME_LENGTH = 214;

export enum StreamState {
  TEXT = 'TEXT',
  THINKING = 'THINKING',
  SANDBOX = 'SANDBOX',
  FILE = 'FILE',
  INSTALL = 'INSTALL',
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
  INSTALL_START = 'install_start',
  INSTALL_CONTENT = 'install_content',
  INSTALL_END = 'install_end',
  PLAN = 'plan',
  PLAN_UPDATE = 'plan_update',
  TODO_UPDATE = 'todo_update',
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
  z.object({ type: z.literal(ParserEventType.INSTALL_START) }),
  z.object({
    type: z.literal(ParserEventType.INSTALL_CONTENT),
    dependencies: z.array(z.string())
      .max(MAX_DEPENDENCIES)
      .refine(
        pkgs => pkgs.every(p =>
          p.length <= MAX_PACKAGE_NAME_LENGTH && NPM_PACKAGE_REGEX.test(p)
        ),
        { message: 'Invalid package name format' }
      ),
    framework: z.enum(['nextjs', 'vite-react', 'vanilla', 'next', 'react', 'vite', 'next.js']).optional()
  }),
  z.object({ type: z.literal(ParserEventType.INSTALL_END) }),
  z.object({ type: z.literal(ParserEventType.PLAN), plan: PlanSchema }),
  z.object({ type: z.literal(ParserEventType.PLAN_UPDATE), plan: PlanSchema }),
  z.object({
    type: z.literal(ParserEventType.TODO_UPDATE),
    todos: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      status: z.enum(['pending', 'in_progress', 'done', 'blocked', 'failed'])
    }))
  }),
  z.object({ type: z.literal(ParserEventType.ERROR), message: z.string() }),
  z.object({ type: z.literal(ParserEventType.META), chatId: z.string(), userMessageId: z.string(), assistantMessageId: z.string(), isNewChat: z.boolean() }),
]);

export type ParserEvent = z.infer<typeof ParserEventSchema>;

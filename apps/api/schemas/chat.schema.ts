import { z } from "zod";
import { MessageRole } from "@edward/auth";
import { Model } from "@edward/shared/schema";
import { ChatActionSchema } from "../services/planning/schemas.js";
import {
  NPM_PACKAGE_REGEX,
  MAX_DEPENDENCIES,
  MAX_PACKAGE_NAME_LENGTH,
} from "../utils/sharedConstants.js";

const ModelValues = Object.values(Model) as [string, ...string[]];

export enum StreamState {
  TEXT = "TEXT",
  THINKING = "THINKING",
  SANDBOX = "SANDBOX",
  FILE = "FILE",
  INSTALL = "INSTALL",
}

export enum ParserEventType {
  TEXT = "text",
  THINKING_START = "thinking_start",
  THINKING_CONTENT = "thinking_content",
  THINKING_END = "thinking_end",
  SANDBOX_START = "sandbox_start",
  SANDBOX_END = "sandbox_end",
  FILE_START = "file_start",
  FILE_CONTENT = "file_content",
  FILE_END = "file_end",
  INSTALL_START = "install_start",
  INSTALL_CONTENT = "install_content",
  INSTALL_END = "install_end",
  ERROR = "error",
  META = "meta",
  COMMAND = "command",
  PREVIEW_URL = "preview_url",
}

export const ChatIdParamSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
});

export const UnifiedSendMessageSchema = z.object({
  content: z.string().min(1, "Message content cannot be empty"),
  chatId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  visibility: z.boolean().optional(),
  model: z.enum(ModelValues).optional(),
});

export const UnifiedSendMessageRequestSchema = z.object({
  body: UnifiedSendMessageSchema,
});

export const GetChatHistoryRequestSchema = z.object({
  params: ChatIdParamSchema,
});

export const RecentChatsQuerySchema = z.object({
  query: z.object({
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 6))
      .pipe(z.number().int().nonnegative().max(100)),
    offset: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 0))
      .pipe(z.number().int().nonnegative()),
  }),
});

export const ParserEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(ParserEventType.TEXT), content: z.string() }),
  z.object({ type: z.literal(ParserEventType.THINKING_START) }),
  z.object({
    type: z.literal(ParserEventType.THINKING_CONTENT),
    content: z.string(),
  }),
  z.object({ type: z.literal(ParserEventType.THINKING_END) }),
  z.object({
    type: z.literal(ParserEventType.SANDBOX_START),
    project: z.string().optional(),
    base: z.string().optional(),
  }),
  z.object({ type: z.literal(ParserEventType.SANDBOX_END) }),
  z.object({ type: z.literal(ParserEventType.FILE_START), path: z.string() }),
  z.object({
    type: z.literal(ParserEventType.FILE_CONTENT),
    content: z.string(),
  }),
  z.object({ type: z.literal(ParserEventType.FILE_END) }),
  z.object({ type: z.literal(ParserEventType.INSTALL_START) }),
  z.object({
    type: z.literal(ParserEventType.INSTALL_CONTENT),
    dependencies: z
      .array(z.string())
      .max(MAX_DEPENDENCIES)
      .refine(
        (pkgs) =>
          pkgs.every(
            (p) =>
              p.length <= MAX_PACKAGE_NAME_LENGTH && NPM_PACKAGE_REGEX.test(p),
          ),
        { message: "Invalid package name format" },
      ),
    framework: z
      .enum([
        "nextjs",
        "vite-react",
        "vanilla",
        "next",
        "react",
        "vite",
        "next.js",
      ])
      .optional(),
  }),
  z.object({ type: z.literal(ParserEventType.INSTALL_END) }),
  z.object({ type: z.literal(ParserEventType.ERROR), message: z.string() }),
  z.object({
    type: z.literal(ParserEventType.META),
    chatId: z.string(),
    userMessageId: z.string(),
    assistantMessageId: z.string(),
    isNewChat: z.boolean(),
    intent: ChatActionSchema.optional(),
    tokenUsage: z
      .object({
        provider: z.enum(["openai", "gemini"]),
        model: z.enum(ModelValues),
        method: z.enum(["openai-tiktoken", "gemini-countTokens", "approx"]),
        contextWindowTokens: z.number().int().nonnegative(),
        reservedOutputTokens: z.number().int().nonnegative(),
        inputTokens: z.number().int().nonnegative(),
        remainingInputTokens: z.number().int().nonnegative(),
        perMessage: z.array(
          z.object({
            index: z.number().int().nonnegative(),
            role: z.union([
              z.literal(MessageRole.System),
              z.literal(MessageRole.User),
              z.literal(MessageRole.Assistant),
            ]),
            tokens: z.number().int().nonnegative(),
          }),
        ),
      })
      .optional(),
  }),
  z.object({
    type: z.literal(ParserEventType.COMMAND),
    command: z.string(),
    args: z.array(z.string()).optional(),
    exitCode: z.number().optional(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
  }),
  z.object({
    type: z.literal(ParserEventType.PREVIEW_URL),
    url: z.string(),
  }),
]);

export type ParserEvent = z.infer<typeof ParserEventSchema>;

import { z } from "zod";
import { MessageRole } from "@edward/auth";
import { Model } from "@edward/shared/schema";
import { Provider } from "@edward/shared/constants";
import { PROMPT_INPUT_CONFIG } from "@edward/shared/constants";
import {
  AgentLoopStopReason,
  MetaPhase,
  ParserEventType,
  StreamTerminationReason,
} from "@edward/shared/streamEvents";
import { ChatActionSchema } from "../services/planning/schemas.js";
import {
  NPM_PACKAGE_REGEX,
  MAX_DEPENDENCIES,
  MAX_PACKAGE_NAME_LENGTH,
} from "../utils/constants.js";
import {
  MessageContentPartSchema,
  MultimodalContentSchema,
} from "../utils/imageValidation/schemas.js";

const ModelValues = Object.values(Model) as [string, ...string[]];

export { ParserEventType, AgentLoopStopReason, MetaPhase, StreamTerminationReason };

export enum StreamState {
  TEXT = "TEXT",
  THINKING = "THINKING",
  SANDBOX = "SANDBOX",
  FILE = "FILE",
  INSTALL = "INSTALL",
}

export const ChatIdParamSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
});

export const RunStreamParamsSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
  runId: z.string().min(1, "Run ID is required"),
});

export const UnifiedSendMessageSchema = z
  .object({
    content: z.union([
      z
        .string()
        .min(1, "Message content cannot be empty")
        .max(
          PROMPT_INPUT_CONFIG.MAX_CHARS,
          `Message exceeds ${PROMPT_INPUT_CONFIG.MAX_CHARS} characters`,
        ),
      MultimodalContentSchema,
    ]),
    chatId: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    visibility: z.boolean().optional(),
    model: z.enum(ModelValues).optional(),
    retryTargetUserMessageId: z.string().min(1).optional(),
    retryTargetAssistantMessageId: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.retryTargetUserMessageId || value.retryTargetAssistantMessageId) &&
      !value.chatId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chatId"],
        message: "chatId is required when retry target message IDs are provided",
      });
    }
  });

export type MessageContentPart = z.infer<typeof MessageContentPartSchema>;
export type MultimodalContent = z.infer<typeof MultimodalContentSchema>;

export const UnifiedSendMessageRequestSchema = z.object({
  body: UnifiedSendMessageSchema,
});

export const GetChatHistoryRequestSchema = z.object({
  params: ChatIdParamSchema,
});

export const RebuildRequestSchema = z.object({
  params: ChatIdParamSchema,
});

export const PromptEnhanceSchema = z.object({
  text: z
    .string()
    .trim()
    .min(30, "Prompt enhancement requires at least 30 characters")
    .max(
      PROMPT_INPUT_CONFIG.MAX_CHARS,
      `Prompt enhancement supports up to ${PROMPT_INPUT_CONFIG.MAX_CHARS} characters`,
    ),
  provider: z.nativeEnum(Provider).optional(),
});

export const PromptEnhanceRequestSchema = z.object({
  body: PromptEnhanceSchema,
});

export const StreamRunEventsRequestSchema = z.object({
  params: RunStreamParamsSchema,
  query: z.object({
    lastEventId: z.string().optional(),
  }),
});

export const CancelRunRequestSchema = z.object({
  params: RunStreamParamsSchema,
});

export const UpdateShareSettingsBodySchema = z.object({
  enabled: z.boolean(),
});

export const ShareStatusRequestSchema = z.object({
  params: ChatIdParamSchema,
});

export const UpdateShareSettingsRequestSchema = z.object({
  params: ChatIdParamSchema,
  body: UpdateShareSettingsBodySchema,
});

export const SharedChatHistoryRequestSchema = z.object({
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
  z.object({ type: z.literal(ParserEventType.DONE) }),
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
  z.object({
    type: z.literal(ParserEventType.ERROR),
    message: z.string(),
    code: z.string().optional(),
    details: z.record(z.unknown()).optional(),
    severity: z.enum(["fatal", "recoverable"]).optional(),
  }),
  z.object({
    type: z.literal(ParserEventType.META),
    chatId: z.string(),
    userMessageId: z.string(),
    assistantMessageId: z.string(),
    isNewChat: z.boolean(),
    runId: z.string().optional(),
    turn: z.number().int().positive().optional(),
    phase: z.nativeEnum(MetaPhase).optional(),
    toolCount: z.number().int().nonnegative().optional(),
    loopStopReason: z.nativeEnum(AgentLoopStopReason).optional(),
    intent: ChatActionSchema.optional(),
    tokenUsage: z
      .object({
        provider: z.enum(["openai", "gemini"]),
        model: z.string(),
        method: z.enum(["openai-tiktoken", "gemini-countTokens", "approx"]),
        contextWindowTokens: z.number().int().nonnegative(),
        reservedOutputTokens: z.number().int().nonnegative(),
        inputTokens: z.number().int().nonnegative(),
        totalContextTokens: z.number().int().nonnegative(),
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
    terminationReason: z.nativeEnum(StreamTerminationReason).optional(),
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
    type: z.literal(ParserEventType.WEB_SEARCH),
    query: z.string().min(1),
    maxResults: z.number().int().positive().max(8).optional(),
    answer: z.string().optional(),
    results: z
      .array(
        z.object({
          title: z.string(),
          url: z.string(),
          snippet: z.string(),
        }),
      )
      .optional(),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal(ParserEventType.URL_SCRAPE),
    results: z.array(
      z.discriminatedUnion("status", [
        z.object({
          status: z.literal("success"),
          url: z.string().url(),
          finalUrl: z.string().url(),
          title: z.string(),
          snippet: z.string(),
        }),
        z.object({
          status: z.literal("error"),
          url: z.string().url(),
          error: z.string(),
        }),
      ]),
    ),
  }),
  z.object({
    type: z.literal(ParserEventType.METRICS),
    completionTime: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal(ParserEventType.PREVIEW_URL),
    url: z.string(),
    chatId: z.string().optional(),
    runId: z.string().optional(),
  }),
  z.object({
    type: z.literal(ParserEventType.BUILD_STATUS),
    chatId: z.string(),
    status: z.enum(["queued", "building", "success", "failed"]),
    buildId: z.string().optional(),
    runId: z.string().optional(),
    previewUrl: z.string().nullable().optional(),
    errorReport: z.unknown().optional(),
  }),
]);

export type ParserEvent = z.infer<typeof ParserEventSchema>;


export const CheckSubdomainQuerySchema = z.object({
  subdomain: z
    .string()
    .min(1, "Subdomain is required")
    .max(63, "Subdomain must be 63 characters or fewer")
    .toLowerCase(),
  chatId: z.string().min(1, "chatId is required"),
});

export type CheckSubdomainQuery = z.infer<typeof CheckSubdomainQuerySchema>;

export const UpdateSubdomainBodySchema = z.object({
  subdomain: z
    .string()
    .min(3, "Subdomain must be at least 3 characters")
    .max(63, "Subdomain must be 63 characters or fewer")
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
      "Only lowercase letters, numbers, and hyphens are allowed. Cannot start or end with a hyphen.",
    ),
});

export type UpdateSubdomainBody = z.infer<typeof UpdateSubdomainBodySchema>;

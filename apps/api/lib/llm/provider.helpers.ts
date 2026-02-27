import OpenAI from "openai";
import { Provider } from "@edward/shared/constants";
import { MessageRole } from "@edward/auth";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
  getModelSpecByProvider,
} from "@edward/shared/schema";
import { ensureError } from "../../utils/error.js";
import { createLogger } from "../../utils/logger.js";
import { getTextFromContent, isMultimodalContent, formatContentForOpenAIResponses } from "./types.js";
import type { LlmChatMessage } from "./context.js";
import type { LlmConversationRole } from "./messageRole.js";
import { normalizeConversationRole } from "./messageRole.js";
import type { MessageContent } from "@edward/shared/llm/types";

const LEGACY_COMPLETIONS_MAX_TOKENS = 4096;
const logger = createLogger("LLM");
const LEGACY_COMPLETIONS_HINT_PATTERN = /not a chat model|v1\/completions endpoint/;
const OPENAI_OUTPUT_DELTA_EVENT_TYPES = new Set(["response.output_text.delta"]);
const DEFAULT_MODEL_BY_PROVIDER: Record<Provider, string> = {
  [Provider.OPENAI]: DEFAULT_OPENAI_MODEL,
  [Provider.GEMINI]: DEFAULT_GEMINI_MODEL,
};
const PROMPT_ROLE_LABEL_BY_ROLE: Record<LlmConversationRole, "Assistant" | "User"> = {
  [MessageRole.Assistant]: "Assistant",
  [MessageRole.User]: "User",
};
const OPENAI_RESPONSE_ROLE_BY_ROLE: Record<LlmConversationRole, "assistant" | "user"> = {
  [MessageRole.Assistant]: "assistant",
  [MessageRole.User]: "user",
};

export interface NormalizedMessage {
  role: LlmConversationRole;
  content: MessageContent;
}

export function resolveModelForProvider(
  provider: Provider,
  modelOverride?: string,
): string {
  if (!modelOverride) {
    return DEFAULT_MODEL_BY_PROVIDER[provider];
  }

  const spec = getModelSpecByProvider(provider, modelOverride);
  if (spec) {
    return spec.id;
  }

  const fallbackModel = DEFAULT_MODEL_BY_PROVIDER[provider];
  logger.warn(
    { provider, requestedModel: modelOverride, fallbackModel },
    "Unknown model for provider; falling back to default model",
  );
  return fallbackModel;
}

export function isLegacyCompletionsHint(error: unknown): boolean {
  const err = ensureError(error);
  const message = err.message.toLowerCase();
  return LEGACY_COMPLETIONS_HINT_PATTERN.test(message);
}

export function buildJsonModeInput(content: string): string {
  const trimmed = content.trim();
  return `${trimmed}\n\nRespond with valid JSON only.`;
}

export function buildLegacyCompletionPrompt(
  systemPrompt: string,
  messages: NormalizedMessage[],
  options?: { jsonMode?: boolean },
): string {
  const sections: string[] = [
    `System:\n${systemPrompt}${options?.jsonMode ? "\n\nReturn only a valid JSON object." : ""}`,
  ];

  for (const msg of messages) {
    const text = getTextFromContent(msg.content).trim();
    if (!text) continue;
    sections.push(`${PROMPT_ROLE_LABEL_BY_ROLE[msg.role]}:\n${text}`);
  }

  sections.push("Assistant:\n");
  return sections.join("\n\n");
}

export function getLegacyCompletionsMaxTokens(model: string): number {
  const spec = getModelSpecByProvider(Provider.OPENAI, model);
  if (!spec) {
    return LEGACY_COMPLETIONS_MAX_TOKENS;
  }

  return Math.max(
    1,
    Math.min(spec.maxOutputTokens, LEGACY_COMPLETIONS_MAX_TOKENS),
  );
}

export function buildOpenAIResponseInput(
  messages: NormalizedMessage[],
): OpenAI.Responses.ResponseInputItem[] {
  return messages.map((msg) => ({
    type: "message",
    role: OPENAI_RESPONSE_ROLE_BY_ROLE[msg.role],
    content: isMultimodalContent(msg.content)
      ? formatContentForOpenAIResponses(msg.content)
      : [{ type: "input_text", text: msg.content }],
  }));
}

export function hasTrimmedText(value: unknown): value is string {
  return Boolean(
    (value as { trim?: () => string } | null | undefined)?.trim?.().length,
  );
}

export function extractOpenAIOutputTextDelta(event: {
  type?: unknown;
  delta?: unknown;
}): string | null {
  const eventType = event?.type;
  if (!OPENAI_OUTPUT_DELTA_EVENT_TYPES.has(String(eventType))) {
    return null;
  }

  const delta = event.delta;
  if (!hasTrimmedText(delta)) {
    return null;
  }

  return delta;
}

export function isAbortSignalError(_error: Error, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

export function normalizeMessages(messages: LlmChatMessage[]): NormalizedMessage[] {
  const result: NormalizedMessage[] = [];

  for (const m of messages || []) {
    if (!m) continue;
    const role = normalizeConversationRole((m as { role?: unknown }).role);
    if (!role) continue;

    const content = m.content;
    if (Array.isArray(content)) {
      if (content.length === 0) continue;
    } else if (!hasTrimmedText(content)) {
      continue;
    }
    result.push({ role, content });
  }

  return result;
}

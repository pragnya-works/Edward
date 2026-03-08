import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { TextBlock } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { GoogleGenAI } from "@google/genai";
import { Provider, API_KEY_REGEX } from "@edward/shared/constants";
import { getModelSpecByProvider } from "@edward/shared/schema";
import { composePrompt, type ComposeOptions } from "./compose.js";
import { ensureError } from "../../utils/error.js";
import { createLogger } from "../../utils/logger.js";
import type { ChatAction } from "../../services/planning/schemas.js";
import type { LlmChatMessage } from "./context.js";
import { MessageRole } from "@edward/auth";
import { toAnthropicRole, toGeminiRole } from "./messageRole.js";
import { formatContentForAnthropic, formatContentForGemini } from "./types.js";
import {
  buildJsonModeInput,
  buildLegacyCompletionPrompt,
  buildOpenAIResponseInput,
  extractOpenAIOutputTextDelta,
  getOpenAIStreamTerminalError,
  getLegacyCompletionsMaxTokens,
  hasTrimmedText,
  isAbortSignalError,
  isLegacyCompletionsHint,
  normalizeMessages,
  resolveModelForProvider,
} from "./provider.helpers.js";
import { streamGeminiResponse } from "./geminiStream.js";

const GENERATION_CONFIG = {
  temperature: 0.2,
  topP: 0.95,
  geminiMaxOutputTokens: 65536,
} as const;
const logger = createLogger("LLM");
const ANTHROPIC_STREAM_TIMEOUT_MS = 20 * 60 * 1_000;
const ANTHROPIC_GENERATE_TIMEOUT_MS = 2 * 60 * 1_000;
const ANTHROPIC_NON_STREAMING_MAX_TOKENS = 16_384;

export interface StreamUsageUpdate {
  outputTokens?: number;
}

function getAnthropicMaxOutputTokens(model: string): number {
  const spec = getModelSpecByProvider(Provider.ANTHROPIC, model);
  return spec?.maxOutputTokens ?? 64_000;
}

function buildAnthropicMessages(messages: LlmChatMessage[]) {
  return messages.map((message) => ({
    role: toAnthropicRole(message.role),
    content: formatContentForAnthropic(message.content),
  }));
}

function extractAnthropicStreamText(event: unknown): string | null {
  if (typeof event !== "object" || event === null) {
    return null;
  }

  const candidate = event as {
    type?: string;
    delta?: { type?: string; text?: string };
  };

  if (
    candidate.type !== "content_block_delta" ||
    candidate.delta?.type !== "text_delta"
  ) {
    return null;
  }

  return candidate.delta.text ?? null;
}

function extractAnthropicStreamOutputTokens(event: unknown): number | null {
  if (typeof event !== "object" || event === null) {
    return null;
  }

  const candidate = event as {
    type?: string;
    usage?: { output_tokens?: number };
  };

  if (
    candidate.type !== "message_delta" ||
    typeof candidate.usage?.output_tokens !== "number"
  ) {
    return null;
  }

  return candidate.usage.output_tokens;
}

function getClient(apiKey: string, modelOverride?: string) {
  if (API_KEY_REGEX[Provider.ANTHROPIC].test(apiKey)) {
    const model = resolveModelForProvider(Provider.ANTHROPIC, modelOverride);
    return {
      type: Provider.ANTHROPIC,
      client: new Anthropic({ apiKey }),
      model,
    };
  } else if (API_KEY_REGEX[Provider.OPENAI].test(apiKey)) {
    const model = resolveModelForProvider(Provider.OPENAI, modelOverride);
    return {
      type: Provider.OPENAI,
      client: new OpenAI({ apiKey }),
      model,
    };
  } else if (API_KEY_REGEX[Provider.GEMINI].test(apiKey)) {
    const model = resolveModelForProvider(Provider.GEMINI, modelOverride);
    return {
      type: Provider.GEMINI,
      client: new GoogleGenAI({ apiKey }),
      model,
    };
  } else {
    throw new Error(
      "Unrecognized API key format. Please provide a valid OpenAI, Gemini, or Anthropic API key.",
    );
  }
}

export async function* streamResponse(
  apiKey: string,
  messages: LlmChatMessage[],
  signal?: AbortSignal,
  verifiedDependencies?: string[],
  customSystemPrompt?: string,
  framework?: string,
  complexity?: string,
  mode?: ChatAction,
  promptProfile?: ComposeOptions["profile"],
  modelOverride?: string,
  onUsage?: (usage: StreamUsageUpdate) => void,
): AsyncGenerator<string> {
  if (!hasTrimmedText(apiKey)) {
    throw new Error("Invalid API key: API key must be a non-empty string");
  }

  const normalized = normalizeMessages(messages);
  if (normalized.length === 0) {
    throw new Error(
      "Invalid messages: At least one non-empty user message is required",
    );
  }

  const { type, client, model } = getClient(apiKey, modelOverride);

  const fullSystemPrompt =
    customSystemPrompt ||
    composePrompt({
      framework: framework as ComposeOptions["framework"],
      complexity: (complexity || "moderate") as ComposeOptions["complexity"],
      verifiedDependencies,
      mode,
      profile: promptProfile,
    });

  try {
    if (type === Provider.OPENAI) {
      const openai = client as OpenAI;
      const input = buildOpenAIResponseInput(normalized);

      try {
        const stream = await openai.responses.create(
          {
            model,
            instructions: fullSystemPrompt,
            input,
            stream: true,
          },
          { signal },
        );

        for await (const event of stream) {
          if (signal?.aborted) break;
          const terminalError = getOpenAIStreamTerminalError(event);
          if (terminalError) {
            throw terminalError;
          }
          const delta = extractOpenAIOutputTextDelta(event);
          if (delta) {
            yield delta;
          }
        }
      } catch (error) {
        if (!isLegacyCompletionsHint(error)) {
          throw error;
        }

        logger.warn(
          { model },
          "Falling back to OpenAI legacy completions endpoint for this model",
        );

        const prompt = buildLegacyCompletionPrompt(
          fullSystemPrompt,
          normalized,
        );
        const stream = await openai.completions.create(
          {
            model,
            prompt,
            max_tokens: getLegacyCompletionsMaxTokens(model),
            stream: true,
          },
          { signal },
        );

        for await (const chunk of stream) {
          if (signal?.aborted) break;
          const text = chunk.choices[0]?.text || "";
          if (text) yield text;
        }
      }
    } else if (type === Provider.GEMINI) {
      const contents = normalized.map((msg) => {
        const geminiRole = toGeminiRole(msg.role!);
        const formattedContent = formatContentForGemini(msg.content);

        return {
          role: geminiRole,
          parts: formattedContent,
        };
      });

      const stream = streamGeminiResponse({
        apiKey,
        model,
        contents,
        systemInstruction: fullSystemPrompt,
        maxOutputTokens: GENERATION_CONFIG.geminiMaxOutputTokens,
        topP: GENERATION_CONFIG.topP,
        temperature: GENERATION_CONFIG.temperature,
        signal,
      });

      for await (const text of stream) {
        if (signal?.aborted) break;
        if (text) yield text;
      }
    } else {
      const anthropic = client as Anthropic;
      const stream = await anthropic.messages.create(
        {
          model,
          system: fullSystemPrompt,
          max_tokens: getAnthropicMaxOutputTokens(model),
          messages: buildAnthropicMessages(normalized),
          temperature: GENERATION_CONFIG.temperature,
          stream: true,
        },
        { signal, timeout: ANTHROPIC_STREAM_TIMEOUT_MS },
      );

      for await (const event of stream) {
        if (signal?.aborted) break;
        const outputTokens = extractAnthropicStreamOutputTokens(event);
        if (outputTokens !== null) {
          onUsage?.({ outputTokens });
        }
        const text = extractAnthropicStreamText(event);
        if (text) {
          yield text;
        }
      }
    }
  } catch (error: unknown) {
    const err = ensureError(error);
    if (isAbortSignalError(err, signal)) {
      logger.info("LLM stream aborted by client");
      return;
    }
    logger.error(err, "LLM streaming failed");
    throw err;
  }
}

export async function generateResponse(
  apiKey: string,
  content: string,
  verifiedDependencies?: string[],
  customSystemPrompt?: string,
  options?: { jsonMode?: boolean; model?: string },
): Promise<string> {
  if (!hasTrimmedText(apiKey)) {
    throw new Error("Invalid API key: API key must be a non-empty string");
  }

  if (!hasTrimmedText(content)) {
    throw new Error("Invalid content: Content must be a non-empty string");
  }

  const { type, client, model } = getClient(apiKey, options?.model);

  const fullSystemPrompt =
    customSystemPrompt ||
    composePrompt({
      verifiedDependencies,
    });

  const jsonMode = options?.jsonMode ?? false;

  try {
    if (type === Provider.OPENAI) {
      const openai = client as OpenAI;
      const inputText = jsonMode ? buildJsonModeInput(content) : content;

      try {
        const response = await openai.responses.create({
          model,
          instructions: fullSystemPrompt,
          input: [
            {
              type: "message",
              role: MessageRole.User,
              content: [{ type: "input_text", text: inputText }],
            },
          ],
          ...(jsonMode && { text: { format: { type: "json_object" } } }),
        });

        return response.output_text || "";
      } catch (error) {
        if (!isLegacyCompletionsHint(error)) {
          throw error;
        }

        logger.warn(
          { model },
          "Falling back to OpenAI legacy completions endpoint for this model",
        );

        const prompt = buildLegacyCompletionPrompt(
          fullSystemPrompt,
          [{ role: MessageRole.User, content }],
          { jsonMode },
        );

        const completion = await openai.completions.create({
          model,
          prompt,
          max_tokens: getLegacyCompletionsMaxTokens(model),
        });

        return completion.choices[0]?.text || "";
      }
    } else if (type === Provider.GEMINI) {
      const genAI = client as GoogleGenAI;

      const result = await genAI.models.generateContent({
        model,
        contents: [{ role: MessageRole.User, parts: [{ text: content }] }],
        config: {
          systemInstruction: fullSystemPrompt,
          ...(jsonMode && { responseMimeType: "application/json" }),
        },
      });
      return result.text ?? "";
    } else {
      const anthropic = client as Anthropic;
      const inputText = jsonMode ? buildJsonModeInput(content) : content;
      const message = await anthropic.messages.create(
        {
          model,
          system: fullSystemPrompt,
          max_tokens: Math.min(
            getAnthropicMaxOutputTokens(model),
            ANTHROPIC_NON_STREAMING_MAX_TOKENS,
          ),
          messages: [
            {
              role: MessageRole.User,
              content: formatContentForAnthropic(inputText),
            },
          ],
          temperature: GENERATION_CONFIG.temperature,
        },
        { timeout: ANTHROPIC_GENERATE_TIMEOUT_MS },
      );

      return message.content
        .filter((block): block is TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
    }
  } catch (error) {
    logger.error(ensureError(error), "LLM response generation failed");
    throw error;
  }
}

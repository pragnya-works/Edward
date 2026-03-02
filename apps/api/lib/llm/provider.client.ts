import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { Provider, API_KEY_REGEX } from "@edward/shared/constants";
import { composePrompt, type ComposeOptions } from "./compose.js";
import { ensureError } from "../../utils/error.js";
import { createLogger } from "../../utils/logger.js";
import type { ChatAction } from "../../services/planning/schemas.js";
import type { LlmChatMessage } from "./context.js";
import { MessageRole } from "@edward/auth";
import { toGeminiRole } from "./messageRole.js";
import {
  isMultimodalContent,
  formatContentForGemini,
} from "./types.js";
import {
  buildJsonModeInput,
  buildLegacyCompletionPrompt,
  buildOpenAIResponseInput,
  extractOpenAIOutputTextDelta,
  getLegacyCompletionsMaxTokens,
  hasTrimmedText,
  isAbortSignalError,
  isLegacyCompletionsHint,
  normalizeMessages,
  resolveModelForProvider,
} from "./provider.helpers.js";

const GENERATION_CONFIG = {
  temperature: 0.2,
  topP: 0.95,
  geminiMaxOutputTokens: 65536,
} as const;
const logger = createLogger("LLM");
const IS_OPENAI_PROVIDER: Record<Provider, boolean> = {
  [Provider.OPENAI]: true,
  [Provider.GEMINI]: false,
};

function getClient(apiKey: string, modelOverride?: string) {
  if (API_KEY_REGEX[Provider.OPENAI].test(apiKey)) {
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
      "Unrecognized API key format. Please provide a valid OpenAI or Gemini API key.",
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
    if (IS_OPENAI_PROVIDER[type]) {
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

        const prompt = buildLegacyCompletionPrompt(fullSystemPrompt, normalized);
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
    } else {
      const genAI = client as GoogleGenAI;

      const contents = normalized.map((msg) => {
        const geminiRole = toGeminiRole(msg.role!);
        const formattedContent = isMultimodalContent(msg.content)
          ? formatContentForGemini(msg.content)
          : [{ text: msg.content }];

        return {
          role: geminiRole,
          parts: formattedContent,
        };
      });

      const stream = await genAI.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: fullSystemPrompt,
          maxOutputTokens: GENERATION_CONFIG.geminiMaxOutputTokens,
          topP: GENERATION_CONFIG.topP,
          temperature: GENERATION_CONFIG.temperature,
          abortSignal: signal,
        },
      });

      for await (const chunk of stream) {
        if (signal?.aborted) break;
        const text = chunk.text;
        if (text) yield text;
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
    if (IS_OPENAI_PROVIDER[type]) {
      const openai = client as OpenAI;
      const inputText = jsonMode ? buildJsonModeInput(content) : content;

      try {
        const response = await openai.responses.create({
          model,
          instructions: fullSystemPrompt,
          input: [
            {
              type: "message",
              role: "user",
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
    } else {
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
    }
  } catch (error) {
    logger.error(ensureError(error), "LLM response generation failed");
    throw error;
  }
}

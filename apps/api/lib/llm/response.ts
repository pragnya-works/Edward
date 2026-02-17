import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Provider, API_KEY_REGEX } from "@edward/shared/constants";
import { composePrompt, type ComposeOptions } from "./compose.js";
import { createLogger } from "../../utils/logger.js";
import { ensureError } from "../../utils/error.js";
import type { ChatAction } from "../../services/planning/schemas.js";
import type { LlmChatMessage } from "./context.js";
import { MessageRole } from "@edward/auth";
import { normalizeConversationRole, toGeminiRole } from "./messageRole.js";
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_GEMINI_MODEL,
} from "@edward/shared/schema";
import type { LlmConversationRole } from "./messageRole.js";
import {
  type MessageContent,
  isMultimodalContent,
  formatContentForOpenAI,
  formatContentForGemini,
} from "./types.js";

const logger = createLogger("LLM");

const GENERATION_CONFIG = {
  temperature: 0.2,
  topP: 0.95,
  geminiMaxOutputTokens: 65536,
} as const;

function getClient(apiKey: string, modelOverride?: string) {
  if (API_KEY_REGEX[Provider.OPENAI].test(apiKey)) {
    const model = modelOverride || DEFAULT_OPENAI_MODEL;
    return {
      type: Provider.OPENAI,
      client: new OpenAI({ apiKey }),
      model,
    };
  } else if (API_KEY_REGEX[Provider.GEMINI].test(apiKey)) {
    const model = modelOverride || DEFAULT_GEMINI_MODEL;
    return {
      type: Provider.GEMINI,
      client: new GoogleGenerativeAI(apiKey),
      model,
    };
  } else {
    throw new Error(
      "Unrecognized API key format. Please provide a valid OpenAI or Gemini API key.",
    );
  }
}

interface NormalizedMessage {
  role: LlmConversationRole;
  content: MessageContent;
}

function normalizeMessages(messages: LlmChatMessage[]): NormalizedMessage[] {
  const result: NormalizedMessage[] = [];

  for (const m of messages || []) {
    if (!m) continue;
    const role = normalizeConversationRole((m as { role?: unknown }).role);
    if (!role) continue;

    const content = m.content;
    if (typeof content === "string" && content.trim().length === 0) continue;
    if (Array.isArray(content) && content.length === 0) continue;
    result.push({ role, content });
  }

  return result;
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
  modelOverride?: string,
): AsyncGenerator<string> {
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
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
    });

  try {
    if (type === Provider.OPENAI) {
      const openai = client as OpenAI;

      const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
        [{ role: MessageRole.System, content: fullSystemPrompt }];

      for (const msg of normalized) {
        const openaiRole = msg.role as "user" | "assistant";
        const formattedContent = isMultimodalContent(msg.content)
          ? formatContentForOpenAI(msg.content)
          : msg.content;

        if (openaiRole === "user") {
          openaiMessages.push({
            role: "user",
            content: formattedContent,
          });
        } else {
          openaiMessages.push({
            role: "assistant",
            content:
              typeof formattedContent === "string"
                ? formattedContent
                : formattedContent
                    .map((p) => (p.type === "text" ? p.text : ""))
                    .join(""),
          });
        }
      }

      const stream = await openai.chat.completions.create(
        {
          model,
          messages: openaiMessages,
          stream: true,
        },
        { signal },
      );

      for await (const chunk of stream) {
        if (signal?.aborted) break;
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) yield text;
      }
    } else {
      const genAI = client as GoogleGenerativeAI;
      const geminiModel = genAI.getGenerativeModel({
        model,
        systemInstruction: fullSystemPrompt,
      });

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

      const result = await geminiModel.generateContentStream(
        {
          contents,
          generationConfig: {
            maxOutputTokens: GENERATION_CONFIG.geminiMaxOutputTokens,
            topP: GENERATION_CONFIG.topP,
            temperature: GENERATION_CONFIG.temperature,
          },
        },
        { signal },
      );

      for await (const chunk of result.stream) {
        if (signal?.aborted) break;
        const text = chunk.text();
        if (text) yield text;
      }
    }
  } catch (error: unknown) {
    const err = ensureError(error);
    if (err.name === "AbortError" || signal?.aborted) {
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
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    throw new Error("Invalid API key: API key must be a non-empty string");
  }

  if (!content || typeof content !== "string" || content.trim().length === 0) {
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
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: MessageRole.System, content: fullSystemPrompt },
          { role: MessageRole.User, content },
        ],
        ...(jsonMode && { response_format: { type: "json_object" } }),
      });
      return completion.choices[0]?.message?.content || "";
    } else {
      const genAI = client as GoogleGenerativeAI;

      const result = await genAI
        .getGenerativeModel({
          model,
          systemInstruction: fullSystemPrompt,
          ...(jsonMode && {
            generationConfig: { responseMimeType: "application/json" },
          }),
        })
        .generateContent({
          contents: [{ role: MessageRole.User, parts: [{ text: content }] }],
        });
      return result.response.text();
    }
  } catch (error) {
    logger.error(ensureError(error), "LLM response generation failed");
    throw error;
  }
}

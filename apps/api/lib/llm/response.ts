import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Provider, API_KEY_REGEX } from '@edward/shared/constants';
import { composePrompt, type ComposeOptions } from './compose.js';
import { createLogger } from "../../utils/logger.js";
import { ensureError } from "../../utils/error.js";
import type { ChatAction } from '../../services/planning/schemas.js';
import type { LlmChatMessage } from './context.js';
import { MessageRole } from '@edward/auth';
import { normalizeConversationRole, toGeminiRole } from './messageRole.js';

const logger = createLogger('LLM');

const GENERATION_CONFIG = {
  temperature: 0.2,
  topP: 0.95,
  geminiMaxOutputTokens: 65536,
} as const;

if (!process.env.GEMINI_MODEL && !process.env.OPENAI_MODEL) {
  logger.warn('Neither GEMINI_MODEL nor OPENAI_MODEL is configured - LLM calls will fail');
}

function getClient(apiKey: string) {
  if (API_KEY_REGEX[Provider.OPENAI].test(apiKey)) {
    const model = process.env.OPENAI_MODEL;
    if (!model) {
      throw new Error('OPENAI_MODEL environment variable is not configured');
    }
    return {
      type: Provider.OPENAI,
      client: new OpenAI({ apiKey }),
      model
    };
  } else if (API_KEY_REGEX[Provider.GEMINI].test(apiKey)) {
    const model = process.env.GEMINI_MODEL;
    if (!model) {
      throw new Error('GEMINI_MODEL environment variable is not configured');
    }
    return {
      type: Provider.GEMINI,
      client: new GoogleGenerativeAI(apiKey),
      model
    };
  } else {
    throw new Error('Unrecognized API key format. Please provide a valid OpenAI or Gemini API key.');
  }
}

export interface StreamOptions {
  apiKey: string;
  messages: LlmChatMessage[];
  signal?: AbortSignal;
  verifiedDependencies?: string[];
  customSystemPrompt?: string;
  framework?: string;
  complexity?: string;
  mode?: ChatAction;
}

function normalizeMessages(messages: LlmChatMessage[]): LlmChatMessage[] {
  return (messages || []).flatMap((m) => {
    if (!m || typeof m.content !== 'string') return [];
    const role = normalizeConversationRole((m as { role?: unknown }).role);
    const content = m.content.trim();
    if (!role || content.length === 0) return [];
    return [{ role, content }];
  });
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
): AsyncGenerator<string> {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('Invalid API key: API key must be a non-empty string');
  }

  const normalized = normalizeMessages(messages);
  if (normalized.length === 0) {
    throw new Error('Invalid messages: At least one non-empty user message is required');
  }

  const { type, client, model } = getClient(apiKey);

  const fullSystemPrompt = customSystemPrompt || composePrompt({
    framework: framework as ComposeOptions['framework'],
    complexity: (complexity || 'moderate') as ComposeOptions['complexity'],
    verifiedDependencies,
    mode,
  });

  try {
    if (type === Provider.OPENAI) {
      const openai = client as OpenAI;
      const stream = await openai.chat.completions.create({
        model,
        messages: [
          { role: MessageRole.System, content: fullSystemPrompt },
          ...normalized,
        ],
        stream: true,
      }, { signal });

      for await (const chunk of stream) {
        if (signal?.aborted) break;
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) yield text;
      }
    } else {
      const genAI = client as GoogleGenerativeAI;
      const geminiModel = genAI.getGenerativeModel({ model, systemInstruction: fullSystemPrompt });

      const contents = normalized.map((m) => ({
        role: toGeminiRole(m.role),
        parts: [{ text: m.content }],
      }));

      const result = await geminiModel.generateContentStream({
        contents,
        generationConfig: {
          maxOutputTokens: GENERATION_CONFIG.geminiMaxOutputTokens,
          topP: GENERATION_CONFIG.topP,
          temperature: GENERATION_CONFIG.temperature,
        }
      }, { signal });

      for await (const chunk of result.stream) {
        if (signal?.aborted) break;
        const text = chunk.text();
        if (text) yield text;
      }
    }
  } catch (error: unknown) {
    const err = ensureError(error);
    if (err.name === 'AbortError' || signal?.aborted) {
      logger.info('LLM stream aborted by client');
      return;
    }
    logger.error(err, 'LLM streaming failed');
    throw err;
  }
}

export async function generateResponse(
  apiKey: string,
  content: string,
  verifiedDependencies?: string[],
  customSystemPrompt?: string,
  options?: { jsonMode?: boolean }
): Promise<string> {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('Invalid API key: API key must be a non-empty string');
  }

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('Invalid content: Content must be a non-empty string');
  }

  const { type, client, model } = getClient(apiKey);

  const fullSystemPrompt = customSystemPrompt || composePrompt({
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
          { role: MessageRole.User, content }
        ],
        ...(jsonMode && { response_format: { type: 'json_object' } }),
      });
      return completion.choices[0]?.message?.content || '';
    } else {
      const genAI = client as GoogleGenerativeAI;

      const result = await genAI.getGenerativeModel({
        model,
        systemInstruction: fullSystemPrompt,
        ...(jsonMode && { generationConfig: { responseMimeType: 'application/json' } }),
      }).generateContent({
        contents: [{ role: MessageRole.User, parts: [{ text: content }] }],
      });
      return result.response.text();
    }
  } catch (error) {
    logger.error(ensureError(error), 'LLM response generation failed');
    throw error;
  }
}

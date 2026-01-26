import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Provider, API_KEY_REGEX } from '@workspace/shared/constants';
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { createLogger } from "../../utils/logger.js";
import { ensureError } from "../../utils/error.js";

const logger = createLogger('LLM');

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

export async function* streamResponse(apiKey: string, content: string, signal?: AbortSignal): AsyncGenerator<string> {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('Invalid API key: API key must be a non-empty string');
  }

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('Invalid content: Content must be a non-empty string');
  }

  const { type, client, model } = getClient(apiKey);

  try {
    if (type === Provider.OPENAI) {
      const openai = client as OpenAI;
      const stream = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content }
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
      const geminiModel = genAI.getGenerativeModel({ model, systemInstruction: SYSTEM_PROMPT });
      
      const result = await geminiModel.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: content }] }]
      });

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

export async function generateResponse(apiKey: string, content: string): Promise<string> {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('Invalid API key: API key must be a non-empty string');
  }

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('Invalid content: Content must be a non-empty string');
  }

  const { type, client, model } = getClient(apiKey);

  try {
    if (type === Provider.OPENAI) {
      const openai = client as OpenAI;
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content }
        ],
      });
      return completion.choices[0]?.message?.content || '';
    } else {
      const genAI = client as GoogleGenerativeAI;
      const geminiModel = genAI.getGenerativeModel({ model, systemInstruction: SYSTEM_PROMPT });
      
      const result = await geminiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: content }] }]
      });
      return result.response.text();
    }
  } catch (error) {
    logger.error(ensureError(error), 'LLM response generation failed');
    throw error;
  }
}

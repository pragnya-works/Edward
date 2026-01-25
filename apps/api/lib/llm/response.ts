import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Provider, API_KEY_REGEX } from '@workspace/shared/constants';
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { createLogger } from "../../utils/logger.js";
import { ensureError } from "../../utils/error.js";

const logger = createLogger('LLM');

function createLLM(apiKey: string) {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Invalid API key provided to LLM factory');
  }

  if (API_KEY_REGEX[Provider.OPENAI].test(apiKey)) {
    const modelName = process.env.OPENAI_MODEL;
    if (!modelName) {
      throw new Error('OPENAI_MODEL environment variable is not configured');
    }
    return new ChatOpenAI({
      apiKey,
      modelName,
    });
  } else if (API_KEY_REGEX[Provider.GEMINI].test(apiKey)) {
    const model = process.env.GEMINI_MODEL;
    if (!model) {
      throw new Error('GEMINI_MODEL environment variable is not configured');
    }
    return new ChatGoogleGenerativeAI({
      apiKey,
      model,
    });
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

  const llm = createLLM(apiKey);

  try {
    const stream = await llm.stream([
      new SystemMessage({ content: SYSTEM_PROMPT }),
      new HumanMessage({ content }),
    ], { signal });

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const chunkContent = chunk.content as string;
      if (chunkContent) {
        yield chunkContent;
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

  const llm = createLLM(apiKey);

  try {
    const response = await llm.invoke([
      new SystemMessage({ content: SYSTEM_PROMPT }),
      new HumanMessage({ content }),
    ]);

    return response.content as string;
  } catch (error) {
    logger.error(ensureError(error), 'LLM response generation failed');
    throw error;
  }
}

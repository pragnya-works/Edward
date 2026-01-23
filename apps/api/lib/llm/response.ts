import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Provider, API_KEY_REGEX } from '@workspace/shared/constants';
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger('LLM');

function createLLM(apiKey: string) {
  if (API_KEY_REGEX[Provider.OPENAI].test(apiKey)) {
    return new ChatOpenAI({
      apiKey,
      modelName: process.env.OPENAI_MODEL,
    });
  } else if (API_KEY_REGEX[Provider.GEMINI].test(apiKey)) {
    return new ChatGoogleGenerativeAI({
      apiKey,
      model: process.env.GEMINI_MODEL as string,
    });
  } else {
    throw new Error('Unrecognized API key format');
  }
}

export async function* streamResponse(apiKey: string, content: string): AsyncGenerator<string> {
  const llm = createLLM(apiKey);
  
  logger.info('🚀 Starting LLM stream...');
  
  const stream = await llm.stream([
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage({ content }),
  ]);

  for await (const chunk of stream) {
    const chunkContent = chunk.content as string;
    if (chunkContent) {
      yield chunkContent;
    }
  }

  logger.info('✅ Stream complete');
}

export async function generateResponse(apiKey: string, content: string): Promise<string> {
  const llm = createLLM(apiKey);
  
  logger.info(`🚀 Generating response for: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
  
  const response = await llm.invoke([
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage({ content }),
  ]);

  const fullResponse = response.content as string;
  
  logger.info(`✅ Response generated: ${fullResponse.length} characters`);
  
  return fullResponse;
}


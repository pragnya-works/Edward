import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { Provider, API_KEY_REGEX } from '@workspace/shared/constants';

export async function generateResponse(apiKey: string, content: string): Promise<string> {
  let llm;
  
  if (API_KEY_REGEX[Provider.OPENAI].test(apiKey)) {
    llm = new ChatOpenAI({
      apiKey,
      modelName: process.env.OPENAI_MODEL,
    });
  } else if (API_KEY_REGEX[Provider.GEMINI].test(apiKey)) {
    llm = new ChatGoogleGenerativeAI({
      apiKey,
      model: process.env.GEMINI_MODEL as string,
    });
  } else {
    throw new Error('Unrecognized API key format');
  }

  const response = await llm.invoke([
    new HumanMessage({ content }),
  ]);

  return response.content as string;
}

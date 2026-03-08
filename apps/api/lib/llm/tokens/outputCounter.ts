import { Provider } from "@edward/shared/constants";
import { getProviderFromModel } from "@edward/shared/schema";
import { countOutputTokens as countOpenAIOutputTokens } from "./openaiCounter.js";

function countApproxTokens(content: string): number {
  return Math.ceil(Buffer.byteLength(content, "utf8") / 4);
}

export function countOutputTokens(content: string, model?: string): number {
  if (!model) {
    return countApproxTokens(content);
  }

  const provider = getProviderFromModel(model);

  if (provider === Provider.OPENAI) {
    return countOpenAIOutputTokens(content, model);
  }

  return countApproxTokens(content);
}

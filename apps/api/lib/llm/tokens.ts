import { Provider } from "@edward/shared/constants";
import type { LlmChatMessage } from "./context.js";
import { countGeminiInputTokens } from "./tokens/geminiCounter.js";
import { getModelForProvider } from "./tokens/config.js";
import { countOpenAIInputTokens } from "./tokens/openaiCounter.js";
import { inferProvider } from "./tokens/provider.js";
import type { TokenUsage } from "./tokens/usage.types.js";

export async function computeTokenUsage(params: {
  apiKey: string;
  systemPrompt: string;
  messages: LlmChatMessage[];
  model?: string;
  userPrompt?: string;
}): Promise<TokenUsage> {
  const { apiKey, systemPrompt, messages, model: modelOverride, userPrompt } = params;
  const provider = inferProvider(apiKey);
  const model = modelOverride || getModelForProvider(provider);

  if (provider === Provider.OPENAI) {
    return countOpenAIInputTokens(systemPrompt, messages, model, userPrompt);
  }

  return countGeminiInputTokens(systemPrompt, messages, model, apiKey, userPrompt);
}

export function isOverContextLimit(usage: TokenUsage): boolean {
  return (
    usage.totalContextTokens + usage.reservedOutputTokens >
    usage.contextWindowTokens
  );
}

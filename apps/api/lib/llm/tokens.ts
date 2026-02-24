import { Provider, type Provider as ProviderType } from "@edward/shared/constants";
import type { LlmChatMessage } from "./context.js";
import type { TokenBreakdownRole } from "./messageRole.js";
import { countGeminiInputTokens } from "./tokens/geminiCounter.js";
import { getModelForProvider } from "./tokens/config.js";
import { countOpenAIInputTokens, countOutputTokens as countOpenAITokens } from "./tokens/openaiCounter.js";
import { inferProvider } from "./tokens/provider.js";

type TokenCountMethod = "openai-tiktoken" | "gemini-countTokens" | "approx";

export interface TokenUsageMessageBreakdown {
  index: number;
  role: TokenBreakdownRole;
  tokens: number;
}

export interface TokenUsage {
  provider: ProviderType;
  model: string;
  method: TokenCountMethod;
  contextWindowTokens: number;
  reservedOutputTokens: number;
  inputTokens: number;
  totalContextTokens: number;
  remainingInputTokens: number;
  perMessage: TokenUsageMessageBreakdown[];
}

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

export function countOutputTokens(content: string, model?: string): number {
  return countOpenAITokens(content, model);
}

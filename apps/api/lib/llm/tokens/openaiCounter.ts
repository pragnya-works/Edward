import { Provider } from "@edward/shared/constants";
import { getFallbackModelSpec, getModelSpecByProvider } from "@edward/shared/schema";
import type { LlmChatMessage } from "../context.js";
import { MessageRole } from "@edward/auth";
import { encodingForModel, getEncoding } from "js-tiktoken";
import { getTextFromContent, hasImages } from "../types.js";
import { DEFAULT_OPENAI_MODEL } from "@edward/shared/schema";
import { getContextWindowOverride, getReservedOutputTokens } from "./config.js";
import { estimateVisionTokens } from "./vision.js";
import type {
  TokenUsage,
  TokenUsageMessageBreakdown,
} from "./usage.types.js";

function getEncodingForOpenAIModel(model: string) {
  try {
    return encodingForModel(model as Parameters<typeof encodingForModel>[0]);
  } catch {
    return null;
  }
}

export function countOpenAIInputTokens(
  systemPrompt: string,
  messages: LlmChatMessage[],
  model: string,
  userPrompt?: string,
): TokenUsage {
  const spec =
    getModelSpecByProvider(Provider.OPENAI, model) ??
    getFallbackModelSpec(Provider.OPENAI, model);
  const contextWindowTokens =
    getContextWindowOverride() ?? spec.contextWindowTokens;
  const reservedOutputTokens = Math.min(
    getReservedOutputTokens(),
    spec.maxOutputTokens,
  );
  const enc =
    getEncodingForOpenAIModel(model) ??
    getEncoding(spec.encoding ?? "cl100k_base");
  const tokensPerMessage = 3;
  const priming = 3;

  const perMessage: TokenUsageMessageBreakdown[] = [];

  const systemTokens = tokensPerMessage + enc.encode(systemPrompt).length;
  perMessage.push({ index: 0, role: MessageRole.System, tokens: systemTokens });

  let messageTotal = 0;
  messages.forEach((m, idx) => {
    const textContent =
      typeof m.content === "string" ? m.content : getTextFromContent(m.content);
    const textTokens = enc.encode(textContent).length;
    const visionTokens = hasImages(m.content)
      ? estimateVisionTokens(m.content)
      : 0;
    const msgTokens = tokensPerMessage + textTokens + visionTokens;
    perMessage.push({ index: idx + 1, role: m.role, tokens: msgTokens });
    messageTotal += msgTokens;
  });

  messageTotal += priming;
  const fullTotal = systemTokens + messageTotal;

  const remainingInputTokens = Math.max(
    0,
    contextWindowTokens - reservedOutputTokens - fullTotal,
  );
  const inputTokens =
    userPrompt !== undefined
      ? tokensPerMessage + enc.encode(userPrompt).length
      : 0;

  return {
    provider: Provider.OPENAI,
    model,
    method: "openai-tiktoken",
    contextWindowTokens,
    reservedOutputTokens,
    inputTokens,
    totalContextTokens: fullTotal,
    remainingInputTokens,
    perMessage,
  };
}

export function countOutputTokens(content: string, model?: string): number {
  const modelName = model || DEFAULT_OPENAI_MODEL;
  try {
    const enc = encodingForModel(
      modelName as Parameters<typeof encodingForModel>[0],
    );
    return enc.encode(content).length;
  } catch {
    const enc = getEncoding("cl100k_base");
    return enc.encode(content).length;
  }
}

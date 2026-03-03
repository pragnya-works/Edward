import { Provider } from "@edward/shared/constants";
import { getFallbackModelSpec, getModelSpecByProvider } from "@edward/shared/schema";
import { GoogleGenAI } from "@google/genai";
import { MessageRole } from "@edward/auth";
import type { LlmChatMessage } from "../context.js";
import { toGeminiRole } from "../messageRole.js";
import { formatContentForGemini, getTextFromContent, hasImages } from "../types.js";
import { getContextWindowOverride, getReservedOutputTokens } from "./config.js";
import { estimateVisionTokens } from "./vision.js";
import type {
  TokenUsage,
  TokenUsageMessageBreakdown,
} from "./usage.types.js";

export async function countGeminiInputTokens(
  systemPrompt: string,
  messages: LlmChatMessage[],
  model: string,
  apiKey: string,
  userPrompt?: string,
): Promise<TokenUsage> {
  const spec =
    getModelSpecByProvider(Provider.GEMINI, model) ??
    getFallbackModelSpec(Provider.GEMINI, model);
  const contextWindowTokens =
    getContextWindowOverride() ?? spec.contextWindowTokens;
  const reservedOutputTokens = Math.min(
    getReservedOutputTokens(),
    spec.maxOutputTokens,
  );

  const approxCount = (): TokenUsage => {
    const approx = (text: string) =>
      Math.ceil(Buffer.byteLength(text, "utf8") / 4);
    const perMessage: TokenUsageMessageBreakdown[] = [];
    const systemTokens = approx(systemPrompt);
    perMessage.push({
      index: 0,
      role: MessageRole.System,
      tokens: systemTokens,
    });

    let messageTotal = 0;
    messages.forEach((m, idx) => {
      const textContent =
        typeof m.content === "string"
          ? m.content
          : getTextFromContent(m.content);
      const textTokens = approx(textContent);
      const visionTokens = hasImages(m.content)
        ? estimateVisionTokens(m.content)
        : 0;
      const tokens = textTokens + visionTokens;
      perMessage.push({ index: idx + 1, role: m.role, tokens });
      messageTotal += tokens;
    });

    const fullTotal = systemTokens + messageTotal;
    const inputTokens = userPrompt ? approx(userPrompt) : 0;

    return {
      provider: Provider.GEMINI,
      model,
      method: "approx",
      contextWindowTokens,
      reservedOutputTokens,
      inputTokens,
      totalContextTokens: fullTotal,
      remainingInputTokens: Math.max(
        0,
        contextWindowTokens - reservedOutputTokens - fullTotal,
      ),
      perMessage,
    };
  };

  try {
    const genAI = new GoogleGenAI({ apiKey });

    const perMessage: TokenUsageMessageBreakdown[] = [];

    const countFn = genAI.models?.countTokens;
    if (typeof countFn === "function") {
      const systemCount = await countFn.call(genAI.models, {
        model,
        contents: [{ role: MessageRole.User, parts: [{ text: systemPrompt }] }],
      });
      const systemTokens = systemCount?.totalTokens ?? 0;
      perMessage.push({
        index: 0,
        role: MessageRole.System,
        tokens: systemTokens,
      });

      const messageCounts = await Promise.all(
        messages.map((m) =>
          countFn.call(genAI.models, {
            model,
            contents: [
              {
                role: toGeminiRole(m.role),
                parts: formatContentForGemini(m.content),
              },
            ],
          }),
        ),
      );

      let messageTotal = 0;
      messageCounts.forEach((count, idx) => {
        const tokens = count?.totalTokens ?? 0;
        messageTotal += tokens;
        perMessage.push({ index: idx + 1, role: messages[idx]!.role, tokens });
      });
      const fullTotal = systemTokens + messageTotal;

      let inputTokens = 0;
      if (userPrompt) {
        const userPromptCount = await countFn.call(genAI.models, {
          model,
          contents: [{ role: MessageRole.User, parts: [{ text: userPrompt }] }],
        });
        inputTokens = userPromptCount?.totalTokens ?? 0;
      }

      return {
        provider: Provider.GEMINI,
        model,
        method: "gemini-countTokens",
        contextWindowTokens,
        reservedOutputTokens,
        inputTokens,
        totalContextTokens: fullTotal,
        remainingInputTokens: Math.max(
          0,
          contextWindowTokens - reservedOutputTokens - fullTotal,
        ),
        perMessage,
      };
    }
  } catch {
    return approxCount();
  }

  return approxCount();
}

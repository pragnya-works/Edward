import { Provider } from "@edward/shared/constants";
import { getFallbackModelSpec, getModelSpecByProvider } from "@edward/shared/schema";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { MessageRole } from "@edward/auth";
import type { LlmChatMessage } from "../context.js";
import { toGeminiRole } from "../messageRole.js";
import { formatContentForGemini, getTextFromContent, hasImages } from "../types.js";
import type { MessageContentPart } from "@edward/shared/llm/types";
import { getContextWindowOverride, getReservedOutputTokens } from "./config.js";
import type { TokenUsage, TokenUsageMessageBreakdown } from "../tokens.js";

function estimateVisionTokens(content: MessageContentPart[] | string): number {
  if (typeof content === "string") return 0;

  let visionTokens = 0;
  for (const part of content) {
    if (part.type === "image") {
      const base64Length = part.base64.length;
      const estimatedBytes = Math.ceil(base64Length * 0.75);
      const estimatedPixels = estimatedBytes;

      if (estimatedPixels <= 512 * 512 * 3) {
        visionTokens += 85;
      } else if (estimatedPixels <= 768 * 768 * 3) {
        visionTokens += 170;
      } else if (estimatedPixels <= 1024 * 1024 * 3) {
        visionTokens += 255;
      } else if (estimatedPixels <= 2048 * 2048 * 3) {
        visionTokens += 425;
      } else {
        visionTokens += 595;
      }
    }
  }

  return visionTokens;
}

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
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiCountModel = genAI.getGenerativeModel({ model });

    const perMessage: TokenUsageMessageBreakdown[] = [];

    const countFn = (
      geminiCountModel as unknown as {
        countTokens?: (req: unknown) => Promise<{ totalTokens?: number }>;
      }
    ).countTokens;
    if (typeof countFn === "function") {
      const systemCount = await countFn.call(geminiCountModel, {
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
          countFn.call(geminiCountModel, {
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
        const userPromptCount = await countFn.call(geminiCountModel, {
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

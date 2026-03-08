import Anthropic from "@anthropic-ai/sdk";
import { Provider } from "@edward/shared/constants";
import {
  getFallbackModelSpec,
  getModelSpecByProvider,
} from "@edward/shared/schema";
import { MessageRole } from "@edward/auth";
import { createLogger } from "../../../utils/logger.js";
import type { LlmChatMessage } from "../context.js";
import { toAnthropicRole } from "../messageRole.js";
import {
  formatContentForAnthropic,
  getTextFromContent,
  hasImages,
} from "../types.js";
import { getContextWindowOverride, getReservedOutputTokens } from "./config.js";
import { estimateVisionTokens } from "./vision.js";
import type { TokenUsage, TokenUsageMessageBreakdown } from "./usage.types.js";

const TOKEN_COUNTER_PLACEHOLDER = "token-counter-placeholder";
const ANTHROPIC_TOKEN_COUNT_TIMEOUT_MS = 5_000;
const ANTHROPIC_TOKEN_COUNT_BATCH_SIZE = 5;
const logger = createLogger("LLM");

function approxTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, "utf8") / 4);
}

function buildApproxPerMessage(
  systemPrompt: string,
  messages: LlmChatMessage[],
): { fullTotal: number; perMessage: TokenUsageMessageBreakdown[] } {
  const perMessage: TokenUsageMessageBreakdown[] = [];
  const systemTokens = approxTokens(systemPrompt);
  perMessage.push({
    index: 0,
    role: MessageRole.System,
    tokens: systemTokens,
  });

  let messageTotal = 0;
  messages.forEach((message, index) => {
    const textContent =
      typeof message.content === "string"
        ? message.content
        : getTextFromContent(message.content);
    const textTokens = approxTokens(textContent);
    const visionTokens = hasImages(message.content)
      ? estimateVisionTokens(message.content)
      : 0;
    const tokens = textTokens + visionTokens;
    perMessage.push({ index: index + 1, role: message.role, tokens });
    messageTotal += tokens;
  });

  return {
    fullTotal: systemTokens + messageTotal,
    perMessage,
  };
}

async function countTokens(
  client: Anthropic,
  params: {
    model: string;
    system?: string;
    messages: Array<{
      role: "assistant" | "user";
      content: ReturnType<typeof formatContentForAnthropic>;
    }>;
  },
): Promise<number> {
  const result = await client.messages.countTokens(
    {
      model: params.model,
      messages: params.messages,
      ...(params.system ? { system: params.system } : {}),
    },
    { timeout: ANTHROPIC_TOKEN_COUNT_TIMEOUT_MS },
  );

  return result.input_tokens ?? 0;
}

export async function countAnthropicInputTokens(
  systemPrompt: string,
  messages: LlmChatMessage[],
  model: string,
  apiKey: string,
  userPrompt?: string,
): Promise<TokenUsage> {
  const spec =
    getModelSpecByProvider(Provider.ANTHROPIC, model) ??
    getFallbackModelSpec(Provider.ANTHROPIC, model);
  const contextWindowTokens =
    getContextWindowOverride() ?? spec.contextWindowTokens;
  const reservedOutputTokens = Math.min(
    getReservedOutputTokens(),
    spec.maxOutputTokens,
  );

  const approxCount = (): TokenUsage => {
    const { fullTotal, perMessage } = buildApproxPerMessage(
      systemPrompt,
      messages,
    );
    const inputTokens = userPrompt ? approxTokens(userPrompt) : 0;

    return {
      provider: Provider.ANTHROPIC,
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
    const client = new Anthropic({
      apiKey,
      timeout: ANTHROPIC_TOKEN_COUNT_TIMEOUT_MS,
    });
    const formattedMessages = messages.map((message) => ({
      role: toAnthropicRole(message.role),
      content: formatContentForAnthropic(message.content),
    }));

    const fullTotal = await countTokens(client, {
      model,
      system: systemPrompt,
      messages: formattedMessages,
    });

    const perMessage: TokenUsageMessageBreakdown[] = [];

    const placeholderMessages = [
      {
        role: "user" as const,
        content: formatContentForAnthropic(TOKEN_COUNTER_PLACEHOLDER),
      },
    ];
    const placeholderOnlyTokens = await countTokens(client, {
      model,
      messages: placeholderMessages,
    });
    const systemWithPlaceholderTokens = await countTokens(client, {
      model,
      system: systemPrompt,
      messages: placeholderMessages,
    });

    perMessage.push({
      index: 0,
      role: MessageRole.System,
      tokens: Math.max(0, systemWithPlaceholderTokens - placeholderOnlyTokens),
    });

    const messageCounts: number[] = [];
    for (
      let startIndex = 0;
      startIndex < formattedMessages.length;
      startIndex += ANTHROPIC_TOKEN_COUNT_BATCH_SIZE
    ) {
      const batch = formattedMessages.slice(
        startIndex,
        startIndex + ANTHROPIC_TOKEN_COUNT_BATCH_SIZE,
      );
      const batchCounts = await Promise.all(
        batch.map((message) =>
          countTokens(client, {
            model,
            messages: [message],
          }),
        ),
      );
      messageCounts.push(...batchCounts);
    }

    for (const [index, tokens] of messageCounts.entries()) {
      const originalMessage = messages[index];
      if (!originalMessage) {
        logger.warn(
          { index, model, messageCount: messages.length },
          "Skipping Anthropic token breakdown entry with no source message",
        );
        continue;
      }

      perMessage.push({
        index: index + 1,
        role: originalMessage.role,
        tokens,
      });
    }

    let inputTokens = 0;
    if (userPrompt) {
      inputTokens = await countTokens(client, {
        model,
        messages: [
          {
            role: "user",
            content: formatContentForAnthropic(userPrompt),
          },
        ],
      });
    }

    return {
      provider: Provider.ANTHROPIC,
      model,
      method: "anthropic-countTokens",
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
  } catch (err: unknown) {
    logger.warn(
      { err, model, messageCount: messages.length },
      "Anthropic token counting failed; falling back to approximate counting",
    );
    return approxCount();
  }
}

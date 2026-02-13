import { Provider, API_KEY_REGEX } from "@edward/shared/constants";
import type { LlmChatMessage } from "./context.js";
import { encodingForModel, getEncoding } from "js-tiktoken";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getFallbackModelSpec,
  getModelSpecByProvider,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_GEMINI_MODEL,
} from "@edward/shared/schema";
import { MessageRole } from "@edward/auth";
import { toGeminiRole, type TokenBreakdownRole } from "./messageRole.js";

type TokenCountMethod = "openai-tiktoken" | "gemini-countTokens" | "approx";

interface TokenUsageMessageBreakdown {
  index: number;
  role: TokenBreakdownRole;
  tokens: number;
}

export interface TokenUsage {
  provider: Provider;
  model: string;
  method: TokenCountMethod;
  contextWindowTokens: number;
  reservedOutputTokens: number;
  inputTokens: number;
  remainingInputTokens: number;
  perMessage: TokenUsageMessageBreakdown[];
}

function inferProvider(apiKey: string): Provider {
  if (API_KEY_REGEX[Provider.OPENAI].test(apiKey)) return Provider.OPENAI;
  if (API_KEY_REGEX[Provider.GEMINI].test(apiKey)) return Provider.GEMINI;
  throw new Error(
    "Unrecognized API key format. Please provide a valid OpenAI or Gemini API key.",
  );
}

function getModelForProvider(provider: Provider): string {
  if (provider === Provider.OPENAI) {
    return DEFAULT_OPENAI_MODEL;
  }
  return DEFAULT_GEMINI_MODEL;
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function getContextWindowOverride(): number | undefined {
  return undefined;
}

function getReservedOutputTokens(): number {
  return parseOptionalInt(process.env.LLM_RESERVED_OUTPUT_TOKENS) ?? 4096;
}

function getEncodingForOpenAIModel(model: string) {
  try {
    return encodingForModel(model as Parameters<typeof encodingForModel>[0]);
  } catch {
    return null;
  }
}

function countOpenAIInputTokens(
  systemPrompt: string,
  messages: LlmChatMessage[],
  model: string,
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

  let total = systemTokens;
  messages.forEach((m, idx) => {
    const msgTokens = tokensPerMessage + enc.encode(m.content).length;
    perMessage.push({ index: idx + 1, role: m.role, tokens: msgTokens });
    total += msgTokens;
  });

  total += priming;

  const remainingInputTokens = Math.max(
    0,
    contextWindowTokens - reservedOutputTokens - total,
  );

  return {
    provider: Provider.OPENAI,
    model,
    method: "openai-tiktoken",
    contextWindowTokens,
    reservedOutputTokens,
    inputTokens: total,
    remainingInputTokens,
    perMessage,
  };
}

async function countGeminiInputTokens(
  systemPrompt: string,
  messages: LlmChatMessage[],
  model: string,
  apiKey: string,
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
    let total = systemTokens;
    messages.forEach((m, idx) => {
      const t = approx(m.content);
      perMessage.push({ index: idx + 1, role: m.role, tokens: t });
      total += t;
    });

    return {
      provider: Provider.GEMINI,
      model,
      method: "approx",
      contextWindowTokens,
      reservedOutputTokens,
      inputTokens: total,
      remainingInputTokens: Math.max(
        0,
        contextWindowTokens - reservedOutputTokens - total,
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
                parts: [{ text: m.content }],
              },
            ],
          }),
        ),
      );

      let total = systemTokens;
      messageCounts.forEach((c, idx) => {
        const tokens = c?.totalTokens ?? 0;
        total += tokens;
        perMessage.push({ index: idx + 1, role: messages[idx]!.role, tokens });
      });

      return {
        provider: Provider.GEMINI,
        model,
        method: "gemini-countTokens",
        contextWindowTokens,
        reservedOutputTokens,
        inputTokens: total,
        remainingInputTokens: Math.max(
          0,
          contextWindowTokens - reservedOutputTokens - total,
        ),
        perMessage,
      };
    }
  } catch {
    return approxCount();
  }

  return approxCount();
}

export async function computeTokenUsage(params: {
  apiKey: string;
  systemPrompt: string;
  messages: LlmChatMessage[];
  model?: string;
}): Promise<TokenUsage> {
  const { apiKey, systemPrompt, messages, model: modelOverride } = params;
  const provider = inferProvider(apiKey);
  const model = modelOverride || getModelForProvider(provider);

  if (provider === Provider.OPENAI) {
    return countOpenAIInputTokens(systemPrompt, messages, model);
  }

  return countGeminiInputTokens(systemPrompt, messages, model, apiKey);
}

export function isOverContextLimit(usage: TokenUsage): boolean {
  return (
    usage.inputTokens + usage.reservedOutputTokens > usage.contextWindowTokens
  );
}

export function countOutputTokens(content: string, model?: string): number {
  const modelName = model || DEFAULT_OPENAI_MODEL;
  try {
    const enc = encodingForModel(modelName as Parameters<typeof encodingForModel>[0]);
    return enc.encode(content).length;
  } catch {
    const enc = getEncoding("cl100k_base");
    return enc.encode(content).length;
  }
}

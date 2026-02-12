import { Provider } from "@edward/shared/constants";

type TokenizerEncoding = "o200k_base" | "cl100k_base";

type ModelSpec = {
  provider: Provider;
  id: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
  encoding?: TokenizerEncoding;
};

const OPENAI: Record<string, ModelSpec> = {
  "gpt-5.2": {
    provider: Provider.OPENAI,
    id: "gpt-5.2",
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    encoding: "o200k_base",
  },
  "gpt-5": {
    provider: Provider.OPENAI,
    id: "gpt-5",
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    encoding: "o200k_base",
  },
  "gpt-5-mini": {
    provider: Provider.OPENAI,
    id: "gpt-5-mini",
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    encoding: "o200k_base",
  },
  "gpt-5-nano": {
    provider: Provider.OPENAI,
    id: "gpt-5-nano-2025-08-07",
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    encoding: "o200k_base",
  },
  o3: {
    provider: Provider.OPENAI,
    id: "o3",
    contextWindowTokens: 200_000,
    maxOutputTokens: 100_000,
    encoding: "o200k_base",
  },
  "gpt-4.1": {
    provider: Provider.OPENAI,
    id: "gpt-4.1",
    contextWindowTokens: 1_047_576,
    maxOutputTokens: 32_768,
    encoding: "o200k_base",
  },
  "gpt-4o": {
    provider: Provider.OPENAI,
    id: "gpt-4o",
    contextWindowTokens: 128_000,
    maxOutputTokens: 16_384,
    encoding: "o200k_base",
  },
  "gpt-4o-mini": {
    provider: Provider.OPENAI,
    id: "gpt-4o-mini",
    contextWindowTokens: 128_000,
    maxOutputTokens: 16_384,
    encoding: "o200k_base",
  },
};

const GEMINI: Record<string, ModelSpec> = {
  "gemini-3-pro-preview": {
    provider: Provider.GEMINI,
    id: "gemini-3-pro-preview",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_536,
  },
  "gemini-3-flash-preview": {
    provider: Provider.GEMINI,
    id: "gemini-3-flash-preview",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_536,
  },
  "gemini-2.5-pro": {
    provider: Provider.GEMINI,
    id: "gemini-2.5-pro",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_535,
  },
  "gemini-2.5-flash": {
    provider: Provider.GEMINI,
    id: "gemini-2.5-flash",
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_535,
  },
};

const MODEL_CATALOG = {
  [Provider.OPENAI]: OPENAI,
  [Provider.GEMINI]: GEMINI,
} as const;

function normalizeModelId(model: string): string {
  const trimmed = String(model || "").trim();
  if (!trimmed) return trimmed;
  if (MODEL_CATALOG[Provider.OPENAI][trimmed]) return trimmed;
  if (MODEL_CATALOG[Provider.GEMINI][trimmed]) return trimmed;

  const candidate = trimmed;
  const openaiBase = Object.keys(MODEL_CATALOG[Provider.OPENAI]).find(
    (k) => candidate === k || candidate.startsWith(`${k}-`),
  );
  if (openaiBase) return openaiBase;

  const geminiBase = Object.keys(MODEL_CATALOG[Provider.GEMINI]).find(
    (k) => candidate === k || candidate.startsWith(`${k}-`),
  );
  if (geminiBase) return geminiBase;

  return trimmed;
}

export function getModelSpec(provider: Provider, model: string): ModelSpec | null {
  const normalized = normalizeModelId(model);
  const catalog = MODEL_CATALOG[provider] as Record<string, ModelSpec>;
  return catalog[normalized] ?? null;
}

export function getFallbackModelSpec(provider: Provider, model: string): ModelSpec {
  if (provider === Provider.OPENAI) {
    return {
      provider,
      id: model,
      contextWindowTokens: 128_000,
      maxOutputTokens: 16_384,
      encoding: "o200k_base",
    };
  }
  return {
    provider,
    id: model,
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_536,
  };
}

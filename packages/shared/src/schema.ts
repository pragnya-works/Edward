import { Provider } from "./constants.js";

export type TokenizerEncoding = "o200k_base" | "cl100k_base";

export type ModelType =
  | "standard"
  | "pro"
  | "codex"
  | "mini"
  | "think"
  | "flash"
  | "lite";

export interface ModelSpec {
  provider: Provider;
  id: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
  encoding?: TokenizerEncoding;
  label: string;
  description: string;
  context: string;
  reasoning: string;
  type: ModelType;
}

export enum Model {
  GPT_5_2_CODEX = "gpt-5.2-codex",
  GPT_5_2_PRO = "gpt-5.2-pro-2025-12-11",
  GPT_5_1_CODEX = "gpt-5.1-codex",
  GPT_5_MINI = "gpt-5-mini-2025-08-07",
  GPT_5_NANO = "gpt-5-nano-2025-08-07",
  GEMINI_3_PRO = "gemini-3-pro",
  GEMINI_3_FLASH = "gemini-3-flash",
  GEMINI_2_5_PRO = "gemini-2.5-pro",
  GEMINI_2_5_FLASH = "gemini-2.5-flash",
}

export const DEFAULT_OPENAI_MODEL = Model.GPT_5_2_PRO;
export const DEFAULT_GEMINI_MODEL = Model.GEMINI_2_5_FLASH;

export const OPENAI_MODELS: Record<string, ModelSpec> = {
  [Model.GPT_5_2_CODEX]: {
    provider: Provider.OPENAI,
    id: Model.GPT_5_2_CODEX,
    contextWindowTokens: 512_000,
    maxOutputTokens: 128_000,
    encoding: "o200k_base",
    label: "GPT-5.2 Codex",
    description: "Optimized for autonomous engineering",
    context: "512k",
    reasoning: "Max",
    type: "codex",
  },
  [Model.GPT_5_2_PRO]: {
    provider: Provider.OPENAI,
    id: Model.GPT_5_2_PRO,
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    encoding: "o200k_base",
    label: "GPT-5.2 Pro",
    description: "Advanced reasoning for complex tasks",
    context: "400k",
    reasoning: "High",
    type: "pro",
  },
  [Model.GPT_5_1_CODEX]: {
    provider: Provider.OPENAI,
    id: Model.GPT_5_1_CODEX,
    contextWindowTokens: 256_000,
    maxOutputTokens: 64_000,
    encoding: "o200k_base",
    label: "GPT-5.1 Codex",
    description: "High-speed engineering intelligence",
    context: "256k",
    reasoning: "Mid",
    type: "codex",
  },
  [Model.GPT_5_MINI]: {
    provider: Provider.OPENAI,
    id: Model.GPT_5_MINI,
    contextWindowTokens: 200_000,
    maxOutputTokens: 64_000,
    encoding: "o200k_base",
    label: "GPT-5 Mini",
    description: "Balanced speed and performance",
    context: "200k",
    reasoning: "Fast",
    type: "mini",
  },
  [Model.GPT_5_NANO]: {
    provider: Provider.OPENAI,
    id: Model.GPT_5_NANO,
    contextWindowTokens: 128_000,
    maxOutputTokens: 16_384,
    encoding: "o200k_base",
    label: "GPT-5 Nano",
    description: "Lightweight and efficient",
    context: "128k",
    reasoning: "Fast",
    type: "mini",
  },
};

export const GEMINI_MODELS: Record<string, ModelSpec> = {
  [Model.GEMINI_3_PRO]: {
    provider: Provider.GEMINI,
    id: Model.GEMINI_3_PRO,
    contextWindowTokens: 2_097_152,
    maxOutputTokens: 65_536,
    label: "Gemini 3 Pro",
    description: "Long-context peak multimodal intelligence",
    context: "2.1M",
    reasoning: "Peak",
    type: "pro",
  },
  [Model.GEMINI_3_FLASH]: {
    provider: Provider.GEMINI,
    id: Model.GEMINI_3_FLASH,
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_536,
    label: "Gemini 3 Flash",
    description: "Sub-second latency for real-time tasks",
    context: "1M",
    reasoning: "Fast",
    type: "flash",
  },
  [Model.GEMINI_2_5_PRO]: {
    provider: Provider.GEMINI,
    id: Model.GEMINI_2_5_PRO,
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_535,
    label: "Gemini 2.5 Pro",
    description: "Robust production-ready intelligence",
    context: "1M",
    reasoning: "High",
    type: "pro",
  },
  [Model.GEMINI_2_5_FLASH]: {
    provider: Provider.GEMINI,
    id: Model.GEMINI_2_5_FLASH,
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_535,
    label: "Gemini 2.5 Flash",
    description: "Fast and efficient for daily workflows",
    context: "1M",
    reasoning: "Fast",
    type: "flash",
  },
};

export const MODEL_CATALOG: Record<Provider, Record<string, ModelSpec>> = {
  [Provider.OPENAI]: OPENAI_MODELS,
  [Provider.GEMINI]: GEMINI_MODELS,
};

export const ALL_MODELS: readonly string[] = [
  ...Object.keys(OPENAI_MODELS),
  ...Object.keys(GEMINI_MODELS),
];

export function isValidModel(model: string): model is Model {
  return ALL_MODELS.includes(model);
}

export function getModelSpec(model: string): ModelSpec | undefined {
  return OPENAI_MODELS[model] ?? GEMINI_MODELS[model];
}

export function getModelSpecByProvider(
  provider: Provider,
  model: string,
): ModelSpec | null {
  const normalized = normalizeModelId(model);
  const catalog = MODEL_CATALOG[provider];
  return catalog[normalized] ?? null;
}

export function getFallbackModelSpec(
  provider: Provider,
  model: string,
): ModelSpec {
  if (provider === Provider.OPENAI) {
    return {
      provider,
      id: model,
      contextWindowTokens: 128_000,
      maxOutputTokens: 16_384,
      encoding: "o200k_base",
      label: model,
      description: "Unknown OpenAI model",
      context: "128k",
      reasoning: "Unknown",
      type: "standard",
    };
  }
  return {
    provider,
    id: model,
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_536,
    label: model,
    description: "Unknown Gemini model",
    context: "1M",
    reasoning: "Unknown",
    type: "standard",
  };
}

export function getModelsByProvider(provider: Provider): ModelSpec[] {
  return Object.values(MODEL_CATALOG[provider]);
}

export function getDefaultModel(provider: Provider): Model {
  return provider === Provider.OPENAI
    ? DEFAULT_OPENAI_MODEL
    : DEFAULT_GEMINI_MODEL;
}

export function getProviderFromModel(model: string): Provider | null {
  if (!model) return null;
  const normalized = model.toLowerCase().trim().replace(/[-\s]/g, "");
  if (normalized.startsWith("gpt")) return Provider.OPENAI;
  if (normalized.startsWith("gemini")) return Provider.GEMINI;
  return null;
}

export function getProviderFromKey(key: string): Provider | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (trimmed.startsWith("sk-")) return Provider.OPENAI;
  if (trimmed.startsWith("AIza")) return Provider.GEMINI;
  return null;
}

export function getBestGuessProvider(
  model?: string | null,
  keyPreview?: string | null,
): Provider {
  if (model) {
    const provider = getProviderFromModel(model);
    if (provider) return provider;
  }
  if (keyPreview) {
    const provider = getProviderFromKey(keyPreview);
    if (provider) return provider;
  }
  return Provider.OPENAI;
}

function normalizeModelId(model: string): string {
  const trimmed = String(model || "").trim();
  if (!trimmed) return trimmed;

  if (isValidModel(trimmed)) return trimmed;

  const allModelKeys = [
    ...Object.keys(OPENAI_MODELS),
    ...Object.keys(GEMINI_MODELS),
  ];
  const match = allModelKeys.find(
    (k) => trimmed === k || trimmed.startsWith(`${k}-`),
  );

  return match ?? trimmed;
}

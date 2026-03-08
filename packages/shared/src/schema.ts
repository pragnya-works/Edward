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
  extendedContextWindowTokens?: number;
  encoding?: TokenizerEncoding;
  apiAlias?: string;
  label: string;
  description: string;
  context: string;
  reasoning: string;
  type: ModelType;
  supportsVision: boolean;
  supportsExtendedThinking?: boolean;
  supportsAdaptiveThinking?: boolean;
  reliableKnowledgeCutoff?: string;
  trainingDataCutoff?: string;
}

export enum Model {
  GPT_5_3_CODEX = "gpt-5.3-codex",
  GPT_5_2_CODEX = "gpt-5.2-codex",
  GPT_5_1_CODEX = "gpt-5.1-codex",
  GPT_5_MINI = "gpt-5-mini-2025-08-07",
  GPT_5_NANO = "gpt-5-nano-2025-08-07",
  GEMINI_3_1_PRO_PREVIEW = "gemini-3.1-pro-preview",
  GEMINI_3_PRO = "gemini-3-pro-preview",
  GEMINI_3_FLASH = "gemini-3-flash-preview",
  GEMINI_2_5_FLASH = "gemini-2.5-flash",
  CLAUDE_OPUS_4_6 = "claude-opus-4-6",
  CLAUDE_SONNET_4_6 = "claude-sonnet-4-6",
  CLAUDE_SONNET_4_5 = "claude-sonnet-4-5-20250929",
  CLAUDE_OPUS_4_5 = "claude-opus-4-5-20251101",
  CLAUDE_HAIKU_4_5 = "claude-haiku-4-5-20251001",
}

export const DEFAULT_OPENAI_MODEL = Model.GPT_5_3_CODEX;
export const DEFAULT_GEMINI_MODEL = Model.GEMINI_2_5_FLASH;
export const DEFAULT_ANTHROPIC_MODEL = Model.CLAUDE_SONNET_4_6;

const OPENAI_MODELS: Record<string, ModelSpec> = {
  [Model.GPT_5_3_CODEX]: {
    provider: Provider.OPENAI,
    id: Model.GPT_5_3_CODEX,
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    encoding: "o200k_base",
    label: "GPT-5.3 Codex",
    description: "Optimized for autonomous engineering",
    context: "400k",
    reasoning: "Max",
    type: "codex",
    supportsVision: true,
  },
  [Model.GPT_5_2_CODEX]: {
    provider: Provider.OPENAI,
    id: Model.GPT_5_2_CODEX,
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    encoding: "o200k_base",
    label: "GPT-5.2 Codex",
    description: "Advanced reasoning for complex tasks",
    context: "400k",
    reasoning: "High",
    type: "codex",
    supportsVision: true,
  },
  [Model.GPT_5_1_CODEX]: {
    provider: Provider.OPENAI,
    id: Model.GPT_5_1_CODEX,
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    encoding: "o200k_base",
    label: "GPT-5.1 Codex",
    description: "High-speed engineering intelligence",
    context: "400k",
    reasoning: "High",
    type: "codex",
    supportsVision: true,
  },
  [Model.GPT_5_MINI]: {
    provider: Provider.OPENAI,
    id: Model.GPT_5_MINI,
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    encoding: "o200k_base",
    label: "GPT-5 Mini",
    description: "Balanced speed and performance",
    context: "400k",
    reasoning: "Fast",
    type: "mini",
    supportsVision: true,
  },
  [Model.GPT_5_NANO]: {
    provider: Provider.OPENAI,
    id: Model.GPT_5_NANO,
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    encoding: "o200k_base",
    label: "GPT-5 Nano",
    description: "Lightweight and efficient",
    context: "400k",
    reasoning: "Fast",
    type: "mini",
    supportsVision: true,
  },
};

export const GEMINI_MODELS: Record<string, ModelSpec> = {
  [Model.GEMINI_3_1_PRO_PREVIEW]: {
    provider: Provider.GEMINI,
    id: Model.GEMINI_3_1_PRO_PREVIEW,
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_536,
    label: "Gemini 3.1 Pro Preview",
    description: "Long-context peak multimodal intelligence",
    context: "1M",
    reasoning: "Peak",
    type: "pro",
    supportsVision: true,
  },
  [Model.GEMINI_3_PRO]: {
    provider: Provider.GEMINI,
    id: Model.GEMINI_3_PRO,
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_536,
    label: "Gemini 3 Pro",
    description: "Long-context multimodal intelligence",
    context: "1M",
    reasoning: "Peak",
    type: "pro",
    supportsVision: true,
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
    supportsVision: true,
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
    supportsVision: true,
  },
};

export const ANTHROPIC_MODELS: Record<string, ModelSpec> = {
  [Model.CLAUDE_OPUS_4_6]: {
    provider: Provider.ANTHROPIC,
    id: Model.CLAUDE_OPUS_4_6,
    contextWindowTokens: 200_000,
    maxOutputTokens: 128_000,
    extendedContextWindowTokens: 1_000_000,
    label: "Claude Opus 4.6",
    description: "Most capable Claude for agents and coding, with adaptive thinking",
    context: "200k / 1M beta",
    reasoning: "Peak",
    type: "pro",
    supportsVision: true,
    supportsExtendedThinking: true,
    supportsAdaptiveThinking: true,
    reliableKnowledgeCutoff: "March 2025",
    trainingDataCutoff: "March 2025",
  },
  [Model.CLAUDE_SONNET_4_6]: {
    provider: Provider.ANTHROPIC,
    id: Model.CLAUDE_SONNET_4_6,
    contextWindowTokens: 200_000,
    maxOutputTokens: 64_000,
    extendedContextWindowTokens: 1_000_000,
    label: "Claude Sonnet 4.6",
    description: "Balanced Claude for coding and agentic workflows with adaptive thinking",
    context: "200k / 1M beta",
    reasoning: "High",
    type: "think",
    supportsVision: true,
    supportsExtendedThinking: true,
    supportsAdaptiveThinking: true,
    reliableKnowledgeCutoff: "March 2025",
    trainingDataCutoff: "March 2025",
  },
  [Model.CLAUDE_SONNET_4_5]: {
    provider: Provider.ANTHROPIC,
    id: Model.CLAUDE_SONNET_4_5,
    apiAlias: "claude-sonnet-4-5",
    contextWindowTokens: 200_000,
    maxOutputTokens: 64_000,
    extendedContextWindowTokens: 1_000_000,
    label: "Claude Sonnet 4.5",
    description: "Earlier high-end Claude for coding, reasoning, and agentic tasks",
    context: "200k / 1M beta",
    reasoning: "High",
    type: "think",
    supportsVision: true,
    supportsExtendedThinking: true,
    supportsAdaptiveThinking: true,
    reliableKnowledgeCutoff: "March 2025",
    trainingDataCutoff: "March 2025",
  },
  [Model.CLAUDE_OPUS_4_5]: {
    provider: Provider.ANTHROPIC,
    id: Model.CLAUDE_OPUS_4_5,
    apiAlias: "claude-opus-4-5",
    contextWindowTokens: 200_000,
    maxOutputTokens: 64_000,
    label: "Claude Opus 4.5",
    description: "Version-pinned flagship Claude for premium reasoning and coding",
    context: "200k",
    reasoning: "Peak",
    type: "pro",
    supportsVision: true,
    supportsExtendedThinking: true,
    supportsAdaptiveThinking: true,
    reliableKnowledgeCutoff: "March 2025",
    trainingDataCutoff: "March 2025",
  },
  [Model.CLAUDE_HAIKU_4_5]: {
    provider: Provider.ANTHROPIC,
    id: Model.CLAUDE_HAIKU_4_5,
    apiAlias: "claude-haiku-4-5",
    contextWindowTokens: 200_000,
    maxOutputTokens: 64_000,
    label: "Claude Haiku 4.5",
    description: "Fast Claude tuned for speed-sensitive coding and agentic tasks",
    context: "200k",
    reasoning: "Fast",
    type: "flash",
    supportsVision: true,
    supportsExtendedThinking: true,
    reliableKnowledgeCutoff: "July 2025",
    trainingDataCutoff: "July 2025",
  },
};

export const MODEL_CATALOG: Record<Provider, Record<string, ModelSpec>> = {
  [Provider.OPENAI]: OPENAI_MODELS,
  [Provider.GEMINI]: GEMINI_MODELS,
  [Provider.ANTHROPIC]: ANTHROPIC_MODELS,
};

const ALL_MODELS: readonly string[] = [
  ...Object.keys(OPENAI_MODELS),
  ...Object.keys(GEMINI_MODELS),
  ...Object.keys(ANTHROPIC_MODELS),
];

const MODEL_ID_ALIASES: Record<string, string> = {
  "claude-sonnet-4-5": Model.CLAUDE_SONNET_4_5,
  "claude-opus-4-5": Model.CLAUDE_OPUS_4_5,
  "claude-haiku-4-5": Model.CLAUDE_HAIKU_4_5,
};

export function isValidModel(model: string): model is Model {
  return ALL_MODELS.includes(model);
}

export function getModelSpec(model: string): ModelSpec | undefined {
  return OPENAI_MODELS[model] ?? GEMINI_MODELS[model] ?? ANTHROPIC_MODELS[model];
}

export function getModelSpecByProvider(
  provider: Provider,
  model: string,
): ModelSpec | null {
  const normalized = normalizeModelId(model);
  const catalog = MODEL_CATALOG[provider];
  return catalog[normalized] ?? null;
}

export function modelSupportsVision(model: string): boolean {
  const spec = getModelSpec(model);
  return spec?.supportsVision ?? false;
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
      supportsVision: true,
    };
  }
  if (provider === Provider.GEMINI) {
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
      supportsVision: true,
    };
  }
  return {
    provider,
    id: model,
    contextWindowTokens: 200_000,
    maxOutputTokens: 64_000,
    label: model,
    description: "Unknown Anthropic model",
    context: "200k",
    reasoning: "Unknown",
    type: "standard",
    supportsVision: true,
  };
}

export function getModelsByProvider(provider: Provider): ModelSpec[] {
  return Object.values(MODEL_CATALOG[provider]);
}

export function getDefaultModel(provider: Provider): Model {
  if (provider === Provider.OPENAI) {
    return DEFAULT_OPENAI_MODEL;
  }
  if (provider === Provider.GEMINI) {
    return DEFAULT_GEMINI_MODEL;
  }
  return DEFAULT_ANTHROPIC_MODEL;
}

export function getProviderFromModel(model: string): Provider | null {
  if (!model) return null;
  const normalized = model.toLowerCase().trim().replace(/[-\s]/g, "");
  if (normalized.startsWith("gpt")) return Provider.OPENAI;
  if (normalized.startsWith("gemini")) return Provider.GEMINI;
  if (normalized.startsWith("claude")) return Provider.ANTHROPIC;
  return null;
}

export function getProviderFromKey(key: string): Provider | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (trimmed.startsWith("sk-ant-")) return Provider.ANTHROPIC;
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
  if (MODEL_ID_ALIASES[trimmed]) return MODEL_ID_ALIASES[trimmed];

  const allModelKeys = [
    ...Object.keys(OPENAI_MODELS),
    ...Object.keys(GEMINI_MODELS),
    ...Object.keys(ANTHROPIC_MODELS),
  ];
  const match = allModelKeys.find(
    (k) => trimmed === k || trimmed.startsWith(`${k}-`),
  );

  if (match) return match;

  const aliasMatch = Object.entries(MODEL_ID_ALIASES).find(
    ([alias]) => trimmed === alias || trimmed.startsWith(`${alias}-`),
  )?.[1];

  return aliasMatch ?? trimmed;
}

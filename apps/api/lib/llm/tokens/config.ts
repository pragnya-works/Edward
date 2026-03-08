import { Provider } from "@edward/shared/constants";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
} from "@edward/shared/schema";

function parseOptionalInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function getModelForProvider(provider: Provider): string {
  if (provider === Provider.OPENAI) {
    return DEFAULT_OPENAI_MODEL;
  }
  if (provider === Provider.GEMINI) {
    return DEFAULT_GEMINI_MODEL;
  }
  if (provider === Provider.ANTHROPIC) {
    return DEFAULT_ANTHROPIC_MODEL;
  }

  throw new Error(`Unknown provider: ${String(provider)}`);
}

export function getContextWindowOverride(): number | undefined {
  return undefined;
}

export function getReservedOutputTokens(): number {
  return parseOptionalInt(process.env.LLM_RESERVED_OUTPUT_TOKENS) ?? 4096;
}

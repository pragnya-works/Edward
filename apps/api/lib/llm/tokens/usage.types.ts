import type { Provider } from "@edward/shared/constants";
import type { TokenBreakdownRole } from "../messageRole.js";

export type TokenCountMethod =
  | "openai-tiktoken"
  | "gemini-countTokens"
  | "anthropic-countTokens"
  | "approx";

export interface TokenUsageMessageBreakdown {
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
  /** Tokens for the current user prompt only (latest turn input), not full context. */
  inputTokens: number;
  /** Full request context tokens (system prompt + conversation/context messages). */
  totalContextTokens: number;
  remainingInputTokens: number;
  perMessage: TokenUsageMessageBreakdown[];
}

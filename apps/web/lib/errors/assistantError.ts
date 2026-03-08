import { UI_EVENTS } from "@edward/shared/constants";
import type { StreamErrorState } from "@edward/shared/chat/types";

export type AssistantErrorSeverity = "caution" | "error";
export type AssistantErrorActionType =
  | "open_api_key"
  | "open_url"
  | "focus_prompt"
  | "retry_generation";

export interface AssistantErrorCTA {
  type: AssistantErrorActionType;
  label: string;
  url?: string;
}

export interface AssistantErrorViewModel {
  code: string;
  title: string;
  message: string;
  severity: AssistantErrorSeverity;
  cta: AssistantErrorCTA;
  rawMessage?: string;
}

const GEMINI_RATE_LIMIT_DOCS_URL =
  "https://ai.google.dev/gemini-api/docs/rate-limits";
const OPENAI_RATE_LIMIT_DOCS_URL =
  "https://platform.openai.com/docs/guides/rate-limits";
const ANTHROPIC_RATE_LIMIT_DOCS_URL =
  "https://docs.anthropic.com/en/api/rate-limits";

function decodeHtml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function inferProvider(
  rawText: string,
): "anthropic" | "gemini" | "openai" | "unknown" {
  const normalized = rawText.toLowerCase();
  if (
    normalized.includes("anthropic") ||
    normalized.includes("claude") ||
    normalized.includes("api.anthropic.com")
  ) {
    return "anthropic";
  }
  if (
    normalized.includes("gemini") ||
    normalized.includes("google") ||
    normalized.includes("generativelanguage.googleapis.com")
  ) {
    return "gemini";
  }
  if (normalized.includes("openai") || normalized.includes("api.openai.com")) {
    return "openai";
  }
  return "unknown";
}

function getRateLimitUrl(
  provider: "anthropic" | "gemini" | "openai" | "unknown",
): string {
  if (provider === "anthropic") return ANTHROPIC_RATE_LIMIT_DOCS_URL;
  if (provider === "openai") return OPENAI_RATE_LIMIT_DOCS_URL;
  if (provider === "gemini") return GEMINI_RATE_LIMIT_DOCS_URL;
  return OPENAI_RATE_LIMIT_DOCS_URL;
}

function buildFallbackError(
  message: string,
  code?: string,
): AssistantErrorViewModel {
  const normalizedMessage = normalizeWhitespace(message);
  const provider = inferProvider(normalizedMessage);
  const normalizedCode = (code || "").toLowerCase();

  if (
    normalizedCode.includes("rate") ||
    normalizedCode.includes("429") ||
    normalizedCode.includes("too_many_requests") ||
    /\b(429|too many requests|rate limit|quota exceeded|resource exhausted)\b/i.test(
      normalizedMessage,
    )
  ) {
    return {
      code: code || "provider_rate_limited",
      title: "Rate limit reached",
      message:
        "The provider rejected this request due to quota/rate limits. Wait a bit or adjust your plan, then retry.",
      severity: "caution",
      cta: {
        type: "open_url",
        label: "View rate limits",
        url: getRateLimitUrl(provider),
      },
      rawMessage: normalizedMessage,
    };
  }

  if (
    normalizedCode.includes("temporarily_unavailable") ||
    normalizedCode.includes("service_unavailable") ||
    /\b(503|service unavailable|high demand|temporarily unavailable|try again later|overloaded|capacity)\b/i.test(
      normalizedMessage,
    )
  ) {
    return {
      code: code || "provider_temporarily_unavailable",
      title: "Provider temporarily unavailable",
      message:
        "The model provider is currently under high demand. Wait a moment and retry.",
      severity: "caution",
      cta: { type: "retry_generation", label: "Try again" },
      rawMessage: normalizedMessage,
    };
  }

  if (
    normalizedCode.includes("auth") ||
    normalizedCode.includes("api_key") ||
    /\b(401|403|unauthorized|forbidden|authentication|invalid api key|api key)\b/i.test(
      normalizedMessage,
    )
  ) {
    return {
      code: code || "provider_auth_failed",
      title: "API key action required",
      message:
        "Your provider API key is missing, invalid, or lacks permissions. Update the key and retry.",
      severity: "error",
      cta: { type: "open_api_key", label: "Update API key" },
      rawMessage: normalizedMessage,
    };
  }

  if (
    normalizedCode.includes("context") ||
    /\b(context window|context too large|maximum context|max tokens|token limit)\b/i.test(
      normalizedMessage,
    )
  ) {
    return {
      code: code || "context_limit_exceeded",
      title: "Prompt exceeds model limits",
      message:
        "This request is larger than the selected model context window. Shorten the prompt and try again.",
      severity: "caution",
      cta: { type: "focus_prompt", label: "Edit prompt" },
      rawMessage: normalizedMessage,
    };
  }

  return {
    code: code || "stream_processing_failed",
    title: "Generation failed",
    message:
      "The model could not complete this request. Please retry in a moment.",
    severity: "error",
    cta: { type: "retry_generation", label: "Try again" },
    rawMessage: normalizedMessage,
  };
}

function normalizeActionType(
  actionRaw: string | undefined,
  actionLabel: string | undefined,
): AssistantErrorActionType {
  if (actionRaw === "open_api_key" || actionRaw === "open_url") {
    return actionRaw;
  }

  if (actionRaw === "retry_generation") {
    return actionRaw;
  }

  if (/\b(try\s*again|retry)\b/i.test(actionLabel || "")) {
    return "retry_generation";
  }

  return "focus_prompt";
}

function parseAssistantErrorTag(content: string): AssistantErrorViewModel | null {
  const trimmed = content.trim();
  const match = trimmed.match(
    /^<edward_error\b([^>]*)>([\s\S]*?)<\/edward_error>$/i,
  );
  if (!match) {
    return null;
  }

  const attrs = match[1] ?? "";
  const body = decodeHtml((match[2] ?? "").trim());
  const parsedAttrs: Record<string, string> = {};
  for (const attrMatch of attrs.matchAll(/([a-zA-Z_]+)="([^"]*)"/g)) {
    const key = attrMatch[1];
    const value = attrMatch[2];
    if (!key || value === undefined) continue;
    parsedAttrs[key] = decodeHtml(value);
  }

  const severity: AssistantErrorSeverity =
    parsedAttrs.severity === "caution" ? "caution" : "error";
  const actionType = normalizeActionType(
    parsedAttrs.action,
    parsedAttrs.action_label,
  );

  return {
    code: parsedAttrs.code || "stream_processing_failed",
    title: parsedAttrs.title || "Generation failed",
    message: body || "The request failed before completion.",
    severity,
    cta: {
      type: actionType,
      label: parsedAttrs.action_label || "Try again",
      url: parsedAttrs.action_url,
    },
  };
}

function shouldTreatAsLegacyError(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return false;

  const providerErrorSignature =
    /\[(googlegenerativeai|openai|anthropic)[^\]]*error\]/i.test(trimmed);
  const hasActionableSignal =
    /\b(429|503|rate limit|quota|high demand|service unavailable|temporarily unavailable|api key|unauthorized|forbidden|context window|max tokens|timeout|timed out)\b/i.test(
      trimmed,
    );

  if (providerErrorSignature) return true;
  if (/^error\s*:/i.test(trimmed) && hasActionableSignal) return true;
  return false;
}

export function parseAssistantErrorMessage(
  content: string | null | undefined,
): AssistantErrorViewModel | null {
  if (!content) return null;

  const fromTag = parseAssistantErrorTag(content);
  if (fromTag) {
    return fromTag;
  }

  if (!shouldTreatAsLegacyError(content)) {
    return null;
  }

  return buildFallbackError(content);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function mapStreamErrorToViewModel(
  error: StreamErrorState,
): AssistantErrorViewModel {
  const details = asRecord(error.details);

  const detailTitle = asString(details?.title);
  const detailSeverity = asString(details?.severity);
  const detailAction = asString(details?.action);
  const detailActionLabel = asString(details?.actionLabel);
  const detailActionUrl = asString(details?.actionUrl);

  if (detailTitle && detailSeverity && detailAction && detailActionLabel) {
    const severity: AssistantErrorSeverity =
      detailSeverity === "caution" ? "caution" : "error";
    const actionType = normalizeActionType(detailAction, detailActionLabel);

    return {
      code: error.code || "stream_processing_failed",
      title: detailTitle,
      message: error.message,
      severity,
      cta: {
        type: actionType,
        label: detailActionLabel,
        url: detailActionUrl || undefined,
      },
      rawMessage: error.message,
    };
  }

  return buildFallbackError(error.message, error.code);
}

export function runAssistantErrorCTA(cta: AssistantErrorCTA): void {
  if (cta.type === "open_api_key") {
    window.dispatchEvent(new Event(UI_EVENTS.OPEN_API_KEY_MODAL));
    return;
  }

  if (cta.type === "open_url" && cta.url) {
    window.open(cta.url, "_blank", "noopener,noreferrer");
    return;
  }

  if (cta.type === "retry_generation") {
    window.dispatchEvent(new Event(UI_EVENTS.FOCUS_PROMPT_INPUT));
    return;
  }

  window.dispatchEvent(new Event(UI_EVENTS.FOCUS_PROMPT_INPUT));
}

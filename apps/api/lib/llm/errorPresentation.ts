type AssistantErrorSeverity = "caution" | "error";
type AssistantErrorAction =
  | "open_api_key"
  | "open_url"
  | "focus_prompt"
  | "retry_generation";

export interface AssistantErrorPresentation {
  code: string;
  title: string;
  message: string;
  severity: AssistantErrorSeverity;
  action: AssistantErrorAction;
  actionLabel: string;
  actionUrl?: string;
}

const GEMINI_RATE_LIMIT_DOCS_URL =
  "https://ai.google.dev/gemini-api/docs/rate-limits";
const OPENAI_RATE_LIMIT_DOCS_URL =
  "https://platform.openai.com/docs/guides/rate-limits";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function inferProviderFromError(
  rawMessage: string,
): "gemini" | "openai" | "unknown" {
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes("gemini") ||
    normalized.includes("google") ||
    normalized.includes("generativelanguage.googleapis.com")
  ) {
    return "gemini";
  }

  if (
    normalized.includes("openai") ||
    normalized.includes("api.openai.com")
  ) {
    return "openai";
  }

  return "unknown";
}

function getRateLimitDocsUrl(provider: "gemini" | "openai" | "unknown"): string {
  if (provider === "gemini") return GEMINI_RATE_LIMIT_DOCS_URL;
  if (provider === "openai") return OPENAI_RATE_LIMIT_DOCS_URL;
  return GEMINI_RATE_LIMIT_DOCS_URL;
}

export function classifyAssistantError(rawMessage: string): AssistantErrorPresentation {
  const normalizedMessage = normalizeWhitespace(rawMessage || "");
  const provider = inferProviderFromError(normalizedMessage);

  if (
    /\b(429|too many requests|rate limit|quota exceeded|resource exhausted)\b/i.test(
      normalizedMessage,
    )
  ) {
    return {
      code: "provider_rate_limited",
      title: "Rate limit reached",
      message:
        "The model provider rejected this request due to quota/rate limits. Wait a bit or adjust your provider plan, then retry.",
      severity: "caution",
      action: "open_url",
      actionLabel: "View rate limits",
      actionUrl: getRateLimitDocsUrl(provider),
    };
  }

  if (
    /\b(401|403|unauthorized|forbidden|authentication|invalid api key|api key)\b/i.test(
      normalizedMessage,
    )
  ) {
    return {
      code: "provider_auth_failed",
      title: "API key action required",
      message:
        "Your provider API key is missing, invalid, or lacks required permissions. Update the key and retry.",
      severity: "error",
      action: "open_api_key",
      actionLabel: "Update API key",
    };
  }

  if (
    /\b(context window|context too large|maximum context|max tokens|token limit)\b/i.test(
      normalizedMessage,
    )
  ) {
    return {
      code: "context_limit_exceeded",
      title: "Prompt exceeds model limits",
      message:
        "This request is larger than the selected model context window. Shorten the prompt or start a fresh chat.",
      severity: "caution",
      action: "focus_prompt",
      actionLabel: "Edit prompt",
    };
  }

  if (
    /\b(model.+(not found|unsupported|unavailable)|does not support)\b/i.test(
      normalizedMessage,
    )
  ) {
    return {
      code: "model_unavailable",
      title: "Selected model unavailable",
      message:
        "The selected model is unavailable or unsupported for this request. Choose another model and retry.",
      severity: "caution",
      action: "open_api_key",
      actionLabel: "Choose model",
    };
  }

  if (/\b(timeout|timed out|deadline exceeded)\b/i.test(normalizedMessage)) {
    return {
      code: "provider_timeout",
      title: "Request timed out",
      message:
        "The model did not finish in time. Please retry the request.",
      severity: "caution",
      action: "retry_generation",
      actionLabel: "Try again",
    };
  }

  return {
    code: "stream_processing_failed",
    title: "Generation failed",
    message:
      "The model could not complete this request. Please retry in a moment.",
    severity: "error",
    action: "retry_generation",
    actionLabel: "Try again",
  };
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function toAssistantErrorTag(error: AssistantErrorPresentation): string {
  const attrs = [
    `code="${escapeHtmlAttribute(error.code)}"`,
    `title="${escapeHtmlAttribute(error.title)}"`,
    `severity="${escapeHtmlAttribute(error.severity)}"`,
    `action="${escapeHtmlAttribute(error.action)}"`,
    `action_label="${escapeHtmlAttribute(error.actionLabel)}"`,
  ];

  if (error.actionUrl) {
    attrs.push(`action_url="${escapeHtmlAttribute(error.actionUrl)}"`);
  }

  return `<edward_error ${attrs.join(" ")}>${escapeHtmlText(error.message)}</edward_error>`;
}

import {
  KNOWN_RATE_LIMIT_SCOPES,
  RATE_LIMIT_POLICY_BY_SCOPE,
} from "@edward/shared/constants";
import {
  isKnownRateLimitScope,
  RATE_LIMIT_SCOPE,
  type KnownRateLimitScope,
  type RateLimitScope,
} from "@/lib/rateLimit/scopes";
import { recordRateLimitCooldown } from "@/lib/rateLimit/state";

interface ApiErrorBase extends Error {
  status: number;
  data?: unknown;
  endpoint: string;
}

export interface HttpApiError extends ApiErrorBase {
  type: "HTTP_ERROR";
}

export interface RateLimitedApiError extends ApiErrorBase {
  type: "RATE_LIMITED";
  status: 429;
  scope: RateLimitScope;
  resetAt: Date;
  retryAfterMs: number;
}

export type ApiError = HttpApiError | RateLimitedApiError;

const DEFAULT_API_URL = "http://localhost:8000";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
const TYPEOF_UNDEFINED = "undefined";
const MIN_EPOCH_SECONDS = 1_000_000_000;
const MIN_EPOCH_MILLISECONDS = 1_000_000_000_000;
const CHAT_BURST_WINDOW_MS =
  RATE_LIMIT_POLICY_BY_SCOPE[RATE_LIMIT_SCOPE.CHAT_BURST].windowMs;
const GITHUB_BURST_WINDOW_MS =
  RATE_LIMIT_POLICY_BY_SCOPE[RATE_LIMIT_SCOPE.GITHUB_BURST].windowMs;
const GITHUB_BURST_LIMIT =
  RATE_LIMIT_POLICY_BY_SCOPE[RATE_LIMIT_SCOPE.GITHUB_BURST].max;
const GITHUB_DAILY_LIMIT =
  RATE_LIMIT_POLICY_BY_SCOPE[RATE_LIMIT_SCOPE.GITHUB_DAILY].max;

if (!process.env.NEXT_PUBLIC_API_URL) {
  console.warn(
    `NEXT_PUBLIC_API_URL is not defined, using default: ${DEFAULT_API_URL}. ` +
      "Please set NEXT_PUBLIC_API_URL in your environment variables for production.",
  );
}

export function buildApiUrl(endpoint: string): string {
  return `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
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

function getApiErrorMessage(errorData: unknown, status: number): string {
  const record = asRecord(errorData);
  const fromError = asString(record?.error);
  if (fromError) {
    return fromError;
  }

  const fromMessage = asString(record?.message);
  if (fromMessage) {
    return fromMessage;
  }

  return `API Error: ${status}`;
}

async function parseErrorData(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function parseNumberHeader(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function parseRateLimitScopeHeader(headers: Headers): KnownRateLimitScope | null {
  const scopeHeader = asString(headers.get("RateLimit-Scope"));
  if (!scopeHeader) {
    return null;
  }

  const candidateScope = scopeHeader as RateLimitScope;
  if (isKnownRateLimitScope(candidateScope)) {
    return candidateScope;
  }

  return null;
}

function resolveRateLimitResetAt(headers: Headers): Date {
  const now = Date.now();
  const rateLimitResetValue = parseNumberHeader(headers.get("RateLimit-Reset"));
  if (rateLimitResetValue !== null) {
    if (rateLimitResetValue >= MIN_EPOCH_MILLISECONDS) {
      return new Date(Math.trunc(rateLimitResetValue));
    }

    if (rateLimitResetValue >= MIN_EPOCH_SECONDS) {
      return new Date(Math.trunc(rateLimitResetValue * 1000));
    }

    if (rateLimitResetValue >= 0) {
      return new Date(now + Math.trunc(rateLimitResetValue * 1000));
    }
  }

  const retryAfterValue = parseNumberHeader(headers.get("Retry-After"));
  if (retryAfterValue !== null && retryAfterValue >= 0) {
    return new Date(now + Math.trunc(retryAfterValue * 1000));
  }

  return new Date(now);
}

function normalizeEndpoint(endpoint: string): string {
  const queryIndex = endpoint.indexOf("?");
  if (queryIndex === -1) {
    return endpoint;
  }

  return endpoint.slice(0, queryIndex);
}

function inferScopeFromErrorMessage(
  normalizedMessage: string,
): KnownRateLimitScope | null {
  for (const scope of KNOWN_RATE_LIMIT_SCOPES) {
    const policy = RATE_LIMIT_POLICY_BY_SCOPE[scope];
    if (normalizedMessage.includes(policy.limitExceededMessage.toLowerCase())) {
      return scope;
    }
  }

  return null;
}

function inferRateLimitScope(params: {
  endpoint: string;
  message: string;
  limitHeader: number | null;
  retryAfterMs: number;
}): RateLimitScope {
  const normalizedEndpoint = normalizeEndpoint(params.endpoint);
  const normalizedMessage = params.message.toLowerCase();

  if (normalizedEndpoint.startsWith("/api-key")) {
    return RATE_LIMIT_SCOPE.API_KEY;
  }

  const scopeFromMessage = inferScopeFromErrorMessage(normalizedMessage);
  if (scopeFromMessage) {
    return scopeFromMessage;
  }

  if (normalizedEndpoint === "/chat/image-upload") {
    return RATE_LIMIT_SCOPE.IMAGE_UPLOAD_BURST;
  }

  if (normalizedEndpoint === "/chat/message") {
    if (params.retryAfterMs > CHAT_BURST_WINDOW_MS) {
      return RATE_LIMIT_SCOPE.CHAT_DAILY;
    }
    return RATE_LIMIT_SCOPE.CHAT_BURST;
  }

  if (normalizedEndpoint.startsWith("/github")) {
    if (params.limitHeader === GITHUB_DAILY_LIMIT) {
      return RATE_LIMIT_SCOPE.GITHUB_DAILY;
    }
    if (params.limitHeader === GITHUB_BURST_LIMIT) {
      return RATE_LIMIT_SCOPE.GITHUB_BURST;
    }
    if (params.retryAfterMs > GITHUB_BURST_WINDOW_MS) {
      return RATE_LIMIT_SCOPE.GITHUB_DAILY;
    }
    return RATE_LIMIT_SCOPE.GITHUB_BURST;
  }

  return RATE_LIMIT_SCOPE.UNKNOWN;
}

async function toApiError(
  response: Response,
  endpoint: string,
): Promise<ApiError> {
  const errorData = await parseErrorData(response);
  const message = getApiErrorMessage(errorData, response.status);

  if (response.status === 429) {
    const resetAt = resolveRateLimitResetAt(response.headers);
    const retryAfterMs = Math.max(resetAt.getTime() - Date.now(), 0);
    const limitHeader = parseNumberHeader(response.headers.get("RateLimit-Limit"));
    const scope =
      parseRateLimitScopeHeader(response.headers) ||
      inferRateLimitScope({
        endpoint,
        message,
        limitHeader,
        retryAfterMs,
      });

    const error = new Error(message) as RateLimitedApiError;
    error.type = "RATE_LIMITED";
    error.status = 429;
    error.data = errorData;
    error.endpoint = endpoint;
    error.scope = scope;
    error.resetAt = resetAt;
    error.retryAfterMs = retryAfterMs;

    recordRateLimitCooldown(scope, resetAt);
    return error;
  }

  const error = new Error(message) as HttpApiError;
  error.type = "HTTP_ERROR";
  error.status = response.status;
  error.data = errorData;
  error.endpoint = endpoint;
  return error;
}

function withDefaultHeaders(options: RequestInit): RequestInit {
  const hasFormDataBody =
    typeof FormData !== TYPEOF_UNDEFINED && options.body instanceof FormData;
  const headers = new Headers(options.headers);

  if (!hasFormDataBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return {
    ...options,
    headers,
    credentials: "include",
  };
}

export async function fetchApiResponse(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const response = await fetch(
    buildApiUrl(endpoint),
    withDefaultHeaders(options),
  );
  if (!response.ok) {
    throw await toApiError(response, endpoint);
  }
  return response;
}

export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetchApiResponse(endpoint, options);
  return response.json() as Promise<T>;
}

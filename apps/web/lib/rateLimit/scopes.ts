import {
  KNOWN_RATE_LIMIT_SCOPES as SHARED_KNOWN_RATE_LIMIT_SCOPES,
  RATE_LIMIT_SCOPE as SHARED_RATE_LIMIT_SCOPE,
  type KnownRateLimitScope,
} from "@edward/shared/constants";

export const RATE_LIMIT_SCOPE = {
  ...SHARED_RATE_LIMIT_SCOPE,
  UNKNOWN: "unknown",
} as const;

export type RateLimitScope = KnownRateLimitScope | typeof RATE_LIMIT_SCOPE.UNKNOWN;

export { type KnownRateLimitScope };

export const KNOWN_RATE_LIMIT_SCOPES: readonly KnownRateLimitScope[] =
  SHARED_KNOWN_RATE_LIMIT_SCOPES;

export function isKnownRateLimitScope(
  scope: RateLimitScope,
): scope is KnownRateLimitScope {
  return scope !== RATE_LIMIT_SCOPE.UNKNOWN;
}

export function formatRateLimitResetTime(resetAt: Date): string {
  return resetAt.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

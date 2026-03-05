import type { KnownRateLimitScope } from "@/lib/rateLimit/scopes";

export type RateLimitSyncMessage =
  | {
      type: "RATE_LIMIT_UPSERT";
      resource: "cooldown";
      scope: KnownRateLimitScope;
      resetAtMs: number;
    }
  | {
      type: "RATE_LIMIT_CLEAR";
      resource: "cooldown";
      scope: KnownRateLimitScope;
    }
  | {
      type: "RATE_LIMIT_UPSERT";
      resource: "quota";
      scope: KnownRateLimitScope;
      limit: number;
      remaining: number;
      resetAtMs: number;
    }
  | {
      type: "RATE_LIMIT_CLEAR";
      resource: "quota";
      scope: KnownRateLimitScope;
    };

export interface RateLimitCooldownSnapshot {
  scope: KnownRateLimitScope;
  resetAt: Date;
  retryAfterMs: number;
  remainingSeconds: number;
}

export interface RateLimitQuotaSnapshot {
  scope: KnownRateLimitScope;
  limit: number;
  remaining: number;
  used: number;
  usagePercent: number;
  resetAt: Date;
}

export interface PersistedRateLimitState {
  cooldowns: Array<{ scope: KnownRateLimitScope; resetAtMs: number }>;
  quotas: Array<{
    scope: KnownRateLimitScope;
    limit: number;
    remaining: number;
    resetAtMs: number;
  }>;
}

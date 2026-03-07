import type { KnownRateLimitScope } from "@/lib/rateLimit/scopes";

export type RateLimitSyncMessage =
  | {
      owner?: string;
      type: "RATE_LIMIT_UPSERT";
      resource: "cooldown";
      scope: KnownRateLimitScope;
      resetAtMs: number;
    }
  | {
      owner?: string;
      type: "RATE_LIMIT_CLEAR";
      resource: "cooldown";
      scope: KnownRateLimitScope;
    }
  | {
      owner?: string;
      type: "RATE_LIMIT_UPSERT";
      resource: "quota";
      scope: KnownRateLimitScope;
      limit: number;
      remaining: number;
      resetAtMs: number;
    }
  | {
      owner?: string;
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

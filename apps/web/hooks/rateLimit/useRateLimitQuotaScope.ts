import { useEffect, useMemo, useState } from "react";
import type { KnownRateLimitScope } from "@/lib/rateLimit/scopes";
import {
  getRateLimitQuota,
  subscribeRateLimitCooldowns,
} from "@/lib/rateLimit/state";

export interface RateLimitQuotaScopeState {
  scope: KnownRateLimitScope;
  hasData: boolean;
  limit: number | null;
  remaining: number | null;
  used: number | null;
  usagePercent: number | null;
  resetAt: Date | null;
}

export function useRateLimitQuotaScope(
  scope: KnownRateLimitScope,
): RateLimitQuotaScopeState {
  const [now, setNow] = useState(() => Date.now());

  const quota = useMemo(() => getRateLimitQuota(scope, now), [scope, now]);
  const quotaResetAtMs = quota?.resetAt.getTime() ?? null;

  useEffect(
    () =>
      subscribeRateLimitCooldowns(() => {
        setNow(Date.now());
      }),
    [],
  );

  useEffect(() => {
    if (!quotaResetAtMs) {
      return;
    }

    const delay = quotaResetAtMs - Date.now();
    if (delay <= 0) {
      setNow(Date.now());
      return;
    }

    const timer = window.setTimeout(() => {
      setNow(Date.now());
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [quotaResetAtMs]);

  if (!quota) {
    return {
      scope,
      hasData: false,
      limit: null,
      remaining: null,
      used: null,
      usagePercent: null,
      resetAt: null,
    };
  }

  return {
    scope,
    hasData: true,
    limit: quota.limit,
    remaining: quota.remaining,
    used: quota.used,
    usagePercent: quota.usagePercent,
    resetAt: quota.resetAt,
  };
}

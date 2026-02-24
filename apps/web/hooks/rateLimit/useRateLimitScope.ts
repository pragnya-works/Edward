import { useEffect, useMemo, useState } from "react";
import type { KnownRateLimitScope } from "@/lib/rateLimit/scopes";
import {
  getRateLimitCooldown,
  sweepExpiredRateLimitCooldowns,
  subscribeRateLimitCooldowns,
} from "@/lib/rateLimit/state";

export interface RateLimitScopeState {
  scope: KnownRateLimitScope;
  isActive: boolean;
  resetAt: Date | null;
  retryAfterMs: number;
  remainingSeconds: number;
}

export function useRateLimitScope(scope: KnownRateLimitScope): RateLimitScopeState {
  const [now, setNow] = useState(() => Date.now());

  const cooldown = useMemo(() => getRateLimitCooldown(scope, now), [scope, now]);
  const cooldownResetAtMs = cooldown?.resetAt.getTime() ?? null;
  const hasActiveCooldown = cooldown !== null;

  useEffect(
    () =>
      subscribeRateLimitCooldowns(() => {
        setNow(Date.now());
      }),
    [],
  );

  useEffect(() => {
    if (!hasActiveCooldown) {
      return;
    }

    const interval = window.setInterval(() => {
      sweepExpiredRateLimitCooldowns(Date.now());
      setNow(Date.now());
    }, 1000);

    const releaseTimer = window.setTimeout(() => {
      sweepExpiredRateLimitCooldowns(Date.now());
      setNow(Date.now());
    }, Math.max((cooldownResetAtMs ?? Date.now()) - Date.now(), 0));

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(releaseTimer);
    };
  }, [cooldownResetAtMs, hasActiveCooldown]);

  if (!cooldown) {
    return {
      scope,
      isActive: false,
      resetAt: null,
      retryAfterMs: 0,
      remainingSeconds: 0,
    };
  }

  return {
    ...cooldown,
    isActive: cooldown.retryAfterMs > 0,
  };
}

import {
  RATE_LIMIT_POLICY_BY_SCOPE,
  RATE_LIMIT_SCOPE,
} from "@edward/shared/constants";
import { redis } from "../../lib/redis.js";

const DAILY_CHAT_POLICY = RATE_LIMIT_POLICY_BY_SCOPE[RATE_LIMIT_SCOPE.CHAT_DAILY];
const DAILY_CHAT_SUCCESS_PREFIX = `rl:${DAILY_CHAT_POLICY.redisPrefix}:success:`;

export interface DailyChatSuccessSnapshot {
  limit: number;
  current: number;
  remaining: number;
  resetAtMs: number;
  isLimited: boolean;
}

function parseRedisInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function getDailyChatSuccessKey(identityKey: string): string {
  return `${DAILY_CHAT_SUCCESS_PREFIX}${identityKey}`;
}

export async function getDailyChatSuccessSnapshot(
  identityKey: string,
  now: number = Date.now(),
): Promise<DailyChatSuccessSnapshot> {
  const key = getDailyChatSuccessKey(identityKey);
  const currentRaw = await redis.call("GET", key);
  const ttlRaw = await redis.call("PTTL", key);

  const current = Math.max(parseRedisInteger(currentRaw, 0), 0);
  let ttlMs = parseRedisInteger(ttlRaw, -2);

  if (current > 0 && ttlMs <= 0) {
    await redis.call("PEXPIRE", key, String(DAILY_CHAT_POLICY.windowMs));
    ttlMs = DAILY_CHAT_POLICY.windowMs;
  }

  const effectiveTtlMs = ttlMs > 0 ? ttlMs : DAILY_CHAT_POLICY.windowMs;
  const remaining = Math.max(DAILY_CHAT_POLICY.max - current, 0);

  return {
    limit: DAILY_CHAT_POLICY.max,
    current,
    remaining,
    resetAtMs: now + effectiveTtlMs,
    isLimited: current >= DAILY_CHAT_POLICY.max,
  };
}

export async function recordDailyChatSuccessfulResponse(
  identityKey: string,
): Promise<void> {
  const key = getDailyChatSuccessKey(identityKey);
  const nextCountRaw = await redis.call("INCR", key);
  const ttlRaw = await redis.call("PTTL", key);

  const nextCount = parseRedisInteger(nextCountRaw, 0);
  const ttlMs = parseRedisInteger(ttlRaw, -2);
  if (nextCount <= 1 || ttlMs <= 0) {
    await redis.call("PEXPIRE", key, String(DAILY_CHAT_POLICY.windowMs));
  }
}

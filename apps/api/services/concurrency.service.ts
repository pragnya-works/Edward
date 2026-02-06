import { redis } from '../lib/redis.js';
import { logger } from '../utils/logger.js';

const MAX_CONCURRENT_PER_USER = 2;
const SLOT_TTL_SECONDS = 300;

function getUserSlotKey(userId: string): string {
  return `user:concurrency:${userId}`;
}

const ACQUIRE_SLOT_SCRIPT = `
local key = KEYS[1]
local max_concurrent = tonumber(ARGV[1])
local ttl_seconds = tonumber(ARGV[2])

local current = redis.call('INCR', key)

if current > max_concurrent then
  -- Over limit: rollback atomically (no partial state possible)
  redis.call('DECR', key)
  return 0
end

-- Success: set/refresh TTL to keep the key alive while slots are held
redis.call('EXPIRE', key, ttl_seconds)
return current
`;

const RELEASE_SLOT_SCRIPT = `
local key = KEYS[1]

local current = redis.call('DECR', key)

if current <= 0 then
  -- Clean up: no active slots, remove the key entirely
  redis.call('DEL', key)
  return 0
end

return current
`;

export async function acquireUserSlot(userId: string): Promise<boolean> {
  const key = getUserSlotKey(userId);

  try {
    const result = await redis.eval(
      ACQUIRE_SLOT_SCRIPT,
      1,
      key,
      MAX_CONCURRENT_PER_USER,
      SLOT_TTL_SECONDS
    ) as number;

    if (result === 0) {
      const current = await getUserConcurrency(userId);
      logger.warn({ userId, current, max: MAX_CONCURRENT_PER_USER },
        'User at max concurrency, request rejected');
      return false;
    }

    return true;
  } catch (error) {
    logger.error({ error, userId },
      'Failed to acquire user slot - Redis unavailable, failing closed');
    return false;
  }
}

export async function releaseUserSlot(userId: string): Promise<void> {
  const key = getUserSlotKey(userId);

  try {
    await redis.eval(
      RELEASE_SLOT_SCRIPT,
      1,
      key
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to release user slot');
  }
}

export async function getUserConcurrency(userId: string): Promise<number> {
  const key = getUserSlotKey(userId);
  const count = await redis.get(key);
  const parsed = count ? parseInt(count, 10) : 0;
  return isNaN(parsed) ? 0 : parsed;
}

export async function withUserSlot<T>(
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  const acquired = await acquireUserSlot(userId);

  if (!acquired) {
    throw new Error('Too many concurrent requests. Please wait and try again.');
  }

  try {
    return await fn();
  } finally {
    await releaseUserSlot(userId);
  }
}
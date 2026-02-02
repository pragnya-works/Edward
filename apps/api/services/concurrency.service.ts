import { redis } from '../lib/redis.js';
import { logger } from '../utils/logger.js';

const MAX_CONCURRENT_PER_USER = 2;
const SLOT_TTL_SECONDS = 300;

function getUserSlotKey(userId: string): string {
  return `user:concurrency:${userId}`;
}

export async function acquireUserSlot(userId: string): Promise<boolean> {
  const key = getUserSlotKey(userId);
  
  try {
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, SLOT_TTL_SECONDS);
    }
    
    if (current > MAX_CONCURRENT_PER_USER) {
      await redis.decr(key);
      logger.warn({ userId, current: current - 1, max: MAX_CONCURRENT_PER_USER }, 
        'User at max concurrency, request rejected');
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to acquire user slot - Redis unavailable, failing closed');
    return false;
  }
}

export async function releaseUserSlot(userId: string): Promise<void> {
  const key = getUserSlotKey(userId);
  
  try {
    const current = await redis.decr(key);
    
    if (current <= 0) {
      await redis.del(key);
    }
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

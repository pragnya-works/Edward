import { nanoid } from 'nanoid';
import { redis } from '../../../lib/redis.js';

const LOCK_PREFIX = 'edward:lock:';
const LOCK_TTL_SECONDS = 300;

export async function acquireLock(lockKey: string): Promise<string | null> {
  const lockId = nanoid();
  const acquired = await redis.set(`${LOCK_PREFIX}${lockKey}`, lockId, 'EX', LOCK_TTL_SECONDS, 'NX');
  return acquired ? lockId : null;
}

export async function releaseLock(lockKey: string, lockId: string): Promise<void> {
  const luaScript = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
        else
            return 0
        end
    `;

  await redis.eval(
    luaScript,
    1,
    `${LOCK_PREFIX}${lockKey}`,
    lockId
  );
}

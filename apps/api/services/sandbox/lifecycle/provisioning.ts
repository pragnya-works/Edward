import { nanoid } from 'nanoid';
import { logger } from '../../../utils/logger.js';
import { SandboxInstance } from '../types.sandbox.js';
import { saveSandboxState, getActiveSandboxState, refreshSandboxExpiry, deleteSandboxState } from '../state.sandbox.js';
import { createContainer, getContainer } from '../docker.sandbox.js';
import { restoreSandboxInstance } from '../backup.sandbox.js';
import { redis } from '../../../lib/redis.js';
import { getTemplateConfig, getDefaultImage, isValidFramework } from '../templates/template.registry.js';
import { PROVISIONING_TIMEOUT_MS, SANDBOX_TTL, CONTAINER_STATUS_CACHE_MS, containerStatusCache } from './state.js';

async function releaseLock(lockKey: string, lockValue: string): Promise<void> {
  const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
  await redis.eval(script, 1, lockKey, lockValue);
}

async function waitForProvisioning(chatId: string): Promise<string | null> {
  const lockKey = `edward:locking:provision:${chatId}`;
  const start = Date.now();

  while (Date.now() - start < PROVISIONING_TIMEOUT_MS) {
    const activeId = await getActiveSandbox(chatId);
    if (activeId) return activeId;

    const isLocked = await redis.get(lockKey);
    if (!isLocked) return null;

    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return null;
}

export async function getActiveSandbox(chatId: string): Promise<string | undefined> {
  const sandbox = await getActiveSandboxState(chatId);
  if (!sandbox) return undefined;

  const cached = containerStatusCache.get(sandbox.containerId);
  if (cached && (Date.now() - cached.timestamp < CONTAINER_STATUS_CACHE_MS)) {
    if (!cached.alive) return undefined;
    await refreshSandboxExpiry(sandbox);
    return sandbox.id;
  }

  try {
    const container = getContainer(sandbox.containerId);
    await container.inspect();

    containerStatusCache.set(sandbox.containerId, { alive: true, timestamp: Date.now() });
    await refreshSandboxExpiry(sandbox);

    return sandbox.id;
  } catch {
    containerStatusCache.set(sandbox.containerId, { alive: false, timestamp: Date.now() });
    logger.warn({ sandboxId: sandbox.id, chatId }, 'Active sandbox container not found, cleaning up');
    await deleteSandboxState(sandbox.id, chatId);
    return undefined;
  }
}

export async function provisionSandbox(userId: string, chatId: string, framework?: string, shouldRestore: boolean = false): Promise<string> {
  const lockKey = `edward:locking:provision:${chatId}`;
  const lockValue = nanoid(16);
  const MAX_ATTEMPTS = 10;

  if (framework && !isValidFramework(framework)) {
    throw new Error(`Unsupported framework: ${framework}`);
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const existingId = await waitForProvisioning(chatId);
      if (existingId) return existingId;

      const acquired = await redis.set(lockKey, lockValue, 'EX', 60, 'NX');
      if (!acquired) {
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
        continue;
      }

      try {
        const doubleCheckId = await getActiveSandbox(chatId);
        if (doubleCheckId) {
          await releaseLock(lockKey, lockValue);
          return doubleCheckId;
        }

        const sandboxId = nanoid(12);
        const image = framework ? (getTemplateConfig(framework)?.image || getDefaultImage()) : getDefaultImage();
        const container = await createContainer(userId, chatId, sandboxId, image);

        const sandbox: SandboxInstance = {
          id: sandboxId,
          containerId: container.id,
          expiresAt: Date.now() + SANDBOX_TTL,
          userId,
          chatId,
          scaffoldedFramework: framework?.toLowerCase(),
        };

        if (shouldRestore) {
          try {
            await restoreSandboxInstance(sandbox);
          } catch (error) {
            logger.error({ error, sandboxId, chatId }, 'Restoration failed during provisioning');
          }
        }

        await saveSandboxState(sandbox);
        await releaseLock(lockKey, lockValue);
        return sandboxId;
      } catch (provisionError) {
        await releaseLock(lockKey, lockValue);
        throw provisionError;
      }
    } catch (error) {
      logger.error({ error, userId, chatId }, 'Failed to provision sandbox');
      throw new Error('Could not provision sandbox environment');
    }
  }

  throw new Error('Could not provision sandbox: lock acquisition timeout');
}

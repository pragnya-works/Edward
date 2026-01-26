import { nanoid } from 'nanoid';
import { logger } from '../../utils/logger.js';
import { SandboxInstance } from './types.sandbox.js';
import { saveSandboxState, deleteSandboxState, getSandboxState, getActiveSandboxState, refreshSandboxExpiry } from './state.sandbox.js';
import { createContainer, destroyContainer, listContainers, SANDBOX_LABEL, getContainer } from './docker.sandbox.js';
import { backupSandboxInstance, restoreSandboxInstance } from './backup.sandbox.js';
import { flushSandbox, clearWriteTimers, clearBuffers } from './writes.sandbox.js';
import { redis } from '../../lib/redis.js';

const SANDBOX_TTL = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const PROVISIONING_TIMEOUT_MS = 30000;
const CONTAINER_STATUS_CACHE_MS = 10000;

let cleanupInterval: NodeJS.Timeout | null = null;
const containerStatusCache = new Map<string, { alive: boolean; timestamp: number }>();

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

export async function provisionSandbox(userId: string, chatId: string): Promise<string> {
    const lockKey = `edward:locking:provision:${chatId}`;
    const MAX_ATTEMPTS = 10;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
            const existingId = await waitForProvisioning(chatId);
            if (existingId) return existingId;

            const acquired = await redis.set(lockKey, 'true', 'EX', 60, 'NX');
            if (!acquired) {
                await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
                continue;
            }

            try {
                const sandboxId = nanoid(12);
                const container = await createContainer(userId, chatId, sandboxId);

                const sandbox: SandboxInstance = {
                    id: sandboxId,
                    containerId: container.id,
                    expiresAt: Date.now() + SANDBOX_TTL,
                    userId,
                    chatId,
                };

                try {
                    await restoreSandboxInstance(sandbox);
                } catch (error) {
                    logger.error({ error, sandboxId, chatId }, 'Restoration failed during provisioning');
                }

                await saveSandboxState(sandbox);
                await redis.del(lockKey);

                logger.info({ sandboxId, userId, chatId, containerId: container.id }, 'Sandbox provisioned');
                return sandboxId;
            } catch (provisionError) {
                await redis.del(lockKey);
                throw provisionError;
            }
        } catch (error) {
            logger.error({ error, userId, chatId }, 'Failed to provision sandbox');
            throw new Error('Could not provision sandbox environment');
        }
    }

    throw new Error('Could not provision sandbox: lock acquisition timeout');
}

export async function cleanupSandbox(sandboxId: string): Promise<void> {
    try {
        const sandbox = await getSandboxState(sandboxId);
        if (!sandbox) return;

        clearWriteTimers(sandboxId);

        try {
            await flushSandbox(sandboxId);
        } catch (error) {
            logger.warn({ error, sandboxId }, 'Flush failed during cleanup');
        }

        try {
            await backupSandboxInstance(sandbox);
        } catch (error) {
            logger.error({ error, sandboxId }, 'Backup failed during cleanup');
        }

        try {
            await destroyContainer(sandbox.containerId);
        } catch (error) {
            logger.error({ error, containerId: sandbox.containerId }, 'Failed to destroy container');
        }

        await deleteSandboxState(sandboxId, sandbox.chatId);
        clearBuffers(sandboxId);

        logger.info({ sandboxId }, 'Sandbox cleaned up');
    } catch (error) {
        logger.error({ error, sandboxId }, 'Unexpected error during sandbox cleanup');
    }
}

async function cleanupExpiredSandboxContainers(): Promise<void> {
    try {
        const containers = await listContainers();
        const sandboxes = containers.filter((info) => info.Labels?.[SANDBOX_LABEL] === 'true');

        for (const info of sandboxes) {
            const sandboxId = info.Labels?.['com.edward.sandboxId'];
            if (!sandboxId) continue;

            const state = await getSandboxState(sandboxId);
            if (!state) {
                logger.info({ sandboxId, containerId: info.Id }, 'Cleaning up expired or orphaned sandbox container');
                await destroyContainer(info.Id).catch(err =>
                    logger.error({ err, sandboxId }, 'Failed to cleanup orphaned container')
                );
            }
        }
    } catch (error) {
        logger.error({ error }, 'Sandbox container cleanup cycle failed');
    }
}

export async function initSandboxService(): Promise<void> {
    await cleanupExpiredSandboxContainers();

    cleanupInterval = setInterval(async () => {
        await cleanupExpiredSandboxContainers();
    }, CLEANUP_INTERVAL_MS);

    logger.info('Sandbox service initialized with automatic container cleanup');
}

export async function shutdownSandboxService(): Promise<void> {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
    logger.info('Sandbox service shutdown complete');
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
    } catch (error) {
        containerStatusCache.set(sandbox.containerId, { alive: false, timestamp: Date.now() });
        logger.warn({ sandboxId: sandbox.id, chatId }, 'Active sandbox container not found, cleaning up stale state');
        await deleteSandboxState(sandbox.id, chatId);
        return undefined;
    }
}

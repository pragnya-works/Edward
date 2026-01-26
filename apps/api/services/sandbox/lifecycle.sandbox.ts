import { nanoid } from 'nanoid';
import { logger } from '../../utils/logger.js';
import { SandboxInstance } from './types.sandbox.js';
import { saveSandboxState, deleteSandboxState, getSandboxState } from './state.sandbox.js';
import { createContainer, destroyContainer, listContainers, SANDBOX_LABEL } from './docker.sandbox.js';
import { backupSandboxInstance } from './backup.sandbox.js';
import { flushSandbox, clearWriteTimers, clearBuffers } from './writes.sandbox.js';

const SANDBOX_TTL = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

let cleanupInterval: NodeJS.Timeout | null = null;

export async function provisionSandbox(userId: string, chatId: string): Promise<string> {
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

        await saveSandboxState(sandbox);

        logger.info({ sandboxId, userId, chatId, containerId: container.id }, 'Sandbox provisioned');
        return sandboxId;
    } catch (error) {
        logger.error({ error, userId, chatId }, 'Failed to provision sandbox');
        throw new Error('Could not provision sandbox environment');
    }
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

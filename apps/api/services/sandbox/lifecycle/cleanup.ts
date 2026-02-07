import { logger } from '../../../utils/logger.js';
import { deleteSandboxState, getSandboxState } from '../state.sandbox.js';
import { destroyContainer, listContainers } from '../docker.sandbox.js';
import { backupSandboxInstance } from '../backup.sandbox.js';
import { flushSandbox, clearWriteTimers, clearBuffers } from '../writes.sandbox.js';
import { SANDBOX_DOCKER_LABEL, containerStatusCache } from './state.js';

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
      containerStatusCache.delete(sandbox.containerId);
    } catch (error) {
      logger.error({ error, containerId: sandbox.containerId }, 'Failed to destroy container');
    }

    await deleteSandboxState(sandboxId, sandbox.chatId);
    clearBuffers(sandboxId);
  } catch (error) {
    logger.error({ error, sandboxId }, 'Unexpected error during sandbox cleanup');
  }
}

export async function cleanupExpiredSandboxContainers(): Promise<void> {
  try {
    const containers = await listContainers();
    const sandboxes = containers.filter((info) => (info as { Labels?: Record<string, string> }).Labels?.[SANDBOX_DOCKER_LABEL] === 'true');

    const chatContainerMap = new Map<string, typeof sandboxes>();
    for (const info of sandboxes) {
      const chatId = info.Labels?.['com.edward.chat'];
      if (!chatId) continue;
      const existing = chatContainerMap.get(chatId) || [];
      existing.push(info);
      chatContainerMap.set(chatId, existing);
    }

    for (const info of sandboxes) {
      const sandboxId = info.Labels?.['com.edward.sandboxId'];
      if (!sandboxId) continue;

      const state = await getSandboxState(sandboxId);
      if (!state) {
        const chatId = info.Labels?.['com.edward.chat'];
        const siblings = chatId ? chatContainerMap.get(chatId) : undefined;

        if (!siblings || siblings.length > 1 || !chatId) {
          logger.info({ sandboxId, containerId: info.Id, chatId }, 'Destroying orphaned sandbox container');
          await destroyContainer(info.Id).catch((err: unknown) =>
            logger.error({ err, sandboxId }, 'Failed to cleanup orphaned container')
          );
          containerStatusCache.delete(info.Id);
        } else {
          logger.debug({ sandboxId, containerId: info.Id, chatId }, 'Skipping lone orphan container (eligible for label recovery)');
        }
      }
    }
  } catch (error) {
    logger.error({ error }, 'Sandbox container cleanup cycle failed');
  }
}

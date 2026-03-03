import { logger } from '../../../utils/logger.js';
import { deleteSandboxState, getSandboxState } from '../state.service.js';
import { destroyContainer, listContainers } from '../docker.service.js';
import { backupSandboxInstance } from '../backup.service.js';
import { flushSandbox } from "../write/flush.js";
import { clearScheduledFlush } from "../write/flush.scheduler.js";
import { clearBuffers } from "../write/buffer.js";
import { SANDBOX_DOCKER_LABEL } from "./state.js";
import { deleteContainerStatus } from "./runtimeState.store.js";
import {
  SandboxLifecycleState,
  transitionSandboxLifecycleState,
} from "./runtimeLifecycle.store.js";

export async function cleanupSandbox(sandboxId: string): Promise<void> {
  try {
    await transitionSandboxLifecycleState({
      sandboxId,
      nextState: SandboxLifecycleState.CLEANING_UP,
      allowFromMissing: true,
    });

    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) {
      await transitionSandboxLifecycleState({
        sandboxId,
        nextState: SandboxLifecycleState.TERMINATED,
        allowFromMissing: true,
      });
      return;
    }

    await clearScheduledFlush(sandboxId);

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
      await deleteContainerStatus(sandbox.containerId);
    } catch (error) {
      logger.error({ error, containerId: sandbox.containerId }, 'Failed to destroy container');
    }

    await deleteSandboxState(sandboxId, sandbox.chatId);
    await clearBuffers(sandboxId);
    await transitionSandboxLifecycleState({
      sandboxId,
      nextState: SandboxLifecycleState.TERMINATED,
      allowFromMissing: true,
    });
  } catch (error) {
    logger.error({ error, sandboxId }, 'Unexpected error during sandbox cleanup');
    await transitionSandboxLifecycleState({
      sandboxId,
      nextState: SandboxLifecycleState.FAILED,
      reason: error instanceof Error ? error.message : String(error),
      allowFromMissing: true,
    });
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
          await deleteContainerStatus(info.Id);
          await transitionSandboxLifecycleState({
            sandboxId,
            nextState: SandboxLifecycleState.TERMINATED,
            allowFromMissing: true,
          });
        } else {
          logger.debug({ sandboxId, containerId: info.Id, chatId }, 'Skipping lone orphan container (eligible for label recovery)');
        }
      }
    }
  } catch (error) {
    logger.error({ error }, 'Sandbox container cleanup cycle failed');
  }
}

import { nanoid } from "nanoid";
import { logger } from "../../../utils/logger.js";
import { ensureError } from "../../../utils/error.js";
import { SandboxInstance } from "../types.service.js";
import {
  saveSandboxState,
  getActiveSandboxState,
  refreshSandboxTTL,
  deleteSandboxState,
} from "../state.service.js";
import {
  createContainer,
  getContainer,
  listContainers,
} from "../docker.service.js";
import { restoreSandboxInstance } from "../backup.service.js";
import { redis } from "../../../lib/redis.js";
import { acquireDistributedLock, releaseDistributedLock } from "../../../lib/distributedLock.js";
import {
  getTemplateConfig,
  getDefaultImage,
  isValidFramework,
} from "../templates/template.registry.js";
import {
  PROVISIONING_TIMEOUT_MS,
  SANDBOX_TTL,
  CONTAINER_STATUS_CACHE_MS,
  SANDBOX_DOCKER_LABEL,
} from "./state.js";
import {
  deleteContainerStatus,
  getContainerStatus,
  setContainerStatus,
} from "./runtimeState.store.js";


async function waitForProvisioning(chatId: string): Promise<string | null> {
  const lockKey = `edward:locking:provision:${chatId}`;
  const start = Date.now();

  while (Date.now() - start < PROVISIONING_TIMEOUT_MS) {
    const activeId = await getActiveSandbox(chatId);
    if (activeId) return activeId;

    const isLocked = await redis.get(lockKey);
    if (!isLocked) return null;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

export async function getActiveSandbox(
  chatId: string,
): Promise<string | undefined> {
  const sandbox = await getActiveSandboxState(chatId);
  if (sandbox) {
    const cached = await getContainerStatus(sandbox.containerId);
    if (cached && Date.now() - cached.timestamp < CONTAINER_STATUS_CACHE_MS) {
      if (!cached.alive) {
        logger.warn(
          { sandboxId: sandbox.id, chatId },
          "Cached container is dead, cleaning up stale Redis state",
        );
        await deleteSandboxState(sandbox.id, chatId);
        await deleteContainerStatus(sandbox.containerId);
      } else {
        await refreshSandboxTTL(sandbox.id, sandbox.chatId);
        return sandbox.id;
      }
    } else {
      try {
        const container = getContainer(sandbox.containerId);
        await container.inspect();

        await setContainerStatus(sandbox.containerId, true);
        await refreshSandboxTTL(sandbox.id, sandbox.chatId);

        return sandbox.id;
      } catch (error) {
        const err = ensureError(error);
        await setContainerStatus(sandbox.containerId, false);
        logger.warn(
          { error: err, sandboxId: sandbox.id, chatId },
          "Active sandbox container not found or error inspecting, cleaning up",
        );
        await deleteSandboxState(sandbox.id, chatId);
      }
    }
  }

  try {
    const containers = await listContainers();
    const chatContainer = containers.find(
      (c) =>
        c.Labels?.[SANDBOX_DOCKER_LABEL] === "true" &&
        c.Labels?.["com.edward.chat"] === chatId &&
        c.State === "running",
    );

    if (chatContainer) {
      const sandboxId = chatContainer.Labels?.["com.edward.sandboxId"];
      const userId = chatContainer.Labels?.["com.edward.user"];
      if (sandboxId && userId) {
        logger.info(
          { sandboxId, chatId, containerId: chatContainer.Id },
          "Recovered running container via Docker labels, rehydrating Redis state",
        );

        const recovered: SandboxInstance = {
          id: sandboxId,
          containerId: chatContainer.Id,
          expiresAt: Date.now() + SANDBOX_TTL,
          userId,
          chatId,
          scaffoldedFramework:
            chatContainer.Labels?.["com.edward.framework"] || undefined,
        };

        await saveSandboxState(recovered);
        await setContainerStatus(chatContainer.Id, true);
        return sandboxId;
      }
    }
  } catch (error) {
    logger.warn(
      { error: ensureError(error), chatId },
      "Docker label-based container recovery failed",
    );
  }

  return undefined;
}

export async function provisionSandbox(
  userId: string,
  chatId: string,
  framework?: string,
  shouldRestore: boolean = false,
): Promise<string> {
  const lockKey = `edward:locking:provision:${chatId}`;
  const MAX_ATTEMPTS = 10;

  if (framework && !isValidFramework(framework)) {
    throw new Error(`Unsupported framework: ${framework}`);
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const existingId = await waitForProvisioning(chatId);
      if (existingId) return existingId;

      const handle = await acquireDistributedLock(lockKey, { ttlMs: 60_000 });
      if (!handle) {
        await new Promise((resolve) =>
          setTimeout(resolve, 200 + Math.random() * 300),
        );
        continue;
      }

      try {
        const doubleCheckId = await getActiveSandbox(chatId);
        if (doubleCheckId) {
          await releaseDistributedLock(handle);
          return doubleCheckId;
        }

        const sandboxId = nanoid(12);
        const image = framework
          ? getTemplateConfig(framework)?.image || getDefaultImage()
          : getDefaultImage();
        const container = await createContainer(
          userId,
          chatId,
          sandboxId,
          image,
        );

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
            logger.error(
              { error, sandboxId, chatId },
              "Restoration failed during provisioning",
            );
          }
        }

        await saveSandboxState(sandbox);

        await releaseDistributedLock(handle);
        return sandboxId;
      } catch (provisionError) {
        await releaseDistributedLock(handle);
        throw provisionError;
      }
    } catch (error) {
      logger.error({ error, userId, chatId }, "Failed to provision sandbox");
      throw new Error("Could not provision sandbox environment");
    }
  }

  throw new Error("Could not provision sandbox: lock acquisition timeout");
}

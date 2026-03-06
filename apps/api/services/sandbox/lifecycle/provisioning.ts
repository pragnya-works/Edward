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
  destroyContainer,
  getContainer,
  initializeWorkspaceWithFiles,
  listContainers,
  execCommand,
  CONTAINER_WORKDIR,
  inspectContainer,
} from "../sandbox-runtime.service.js";
import { restoreSandboxInstance } from "../backup.service.js";
import { redis } from "../../../lib/redis.js";
import { acquireDistributedLock, releaseDistributedLock } from "../../../lib/distributedLock.js";
import {
  getTemplateConfig,
  getDefaultSnapshotId,
  isValidFramework,
} from "../templates/template.registry.js";
import { loadTemplateFiles } from "../templates/template.loader.js";
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
import {
  SandboxLifecycleState,
  transitionSandboxLifecycleState,
} from "./runtimeLifecycle.store.js";

const DEFAULT_GITIGNORE_CONTENT = `node_modules
.pnpm-store
.next
dist
build
out
.output
coverage
.turbo
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.env
.env.*
!.env.example
!.env.sample
!.env.template
!.env.dist
.DS_Store
`;

async function ensureScaffoldGitignore(
  containerId: string,
  sandboxId: string,
  framework?: string,
): Promise<void> {
  if (framework === "vanilla") {
    return;
  }

  const container = getContainer(containerId);
  const existsResult = await execCommand(
    container,
    ["test", "-f", ".gitignore"],
    false,
    5000,
    undefined,
    CONTAINER_WORKDIR,
  );

  if (existsResult.exitCode === 0) {
    return;
  }

  const encoded = Buffer.from(DEFAULT_GITIGNORE_CONTENT, "utf8").toString("base64");
  const writeResult = await execCommand(
    container,
    ["sh", "-c", `echo '${encoded}' | base64 -d > .gitignore`],
    false,
    5000,
    undefined,
    CONTAINER_WORKDIR,
  );

  if (writeResult.exitCode !== 0) {
    throw new Error(
      `Failed to scaffold .gitignore: ${writeResult.stderr || writeResult.stdout}`,
    );
  }

  logger.info({ sandboxId }, "Scaffolded default .gitignore");
}

async function scaffoldTemplateWorkspace(params: {
  containerId: string;
  sandboxId: string;
  framework?: string;
  snapshotId?: string;
}): Promise<void> {
  const { containerId, sandboxId, framework, snapshotId } = params;
  if (snapshotId) {
    return;
  }

  const scaffoldFramework = framework || "vanilla";
  const files = await loadTemplateFiles(scaffoldFramework);
  await initializeWorkspaceWithFiles(getContainer(containerId), files);
  logger.info(
    {
      sandboxId,
      framework: scaffoldFramework,
      fileCount: Object.keys(files).length,
    },
    "Scaffolded sandbox workspace from local template files",
  );
}


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
        await transitionSandboxLifecycleState({
          sandboxId: sandbox.id,
          nextState: SandboxLifecycleState.FAILED,
          reason: "cached_container_dead",
          allowFromMissing: true,
        });
        await deleteSandboxState(sandbox.id, chatId);
        await deleteContainerStatus(sandbox.containerId);
      } else {
        await transitionSandboxLifecycleState({
          sandboxId: sandbox.id,
          nextState: SandboxLifecycleState.ACTIVE,
          allowFromMissing: true,
        });
        await refreshSandboxTTL(sandbox.id, sandbox.chatId);
        return sandbox.id;
      }
      } else {
        try {
        await inspectContainer(sandbox.containerId);

        await setContainerStatus(sandbox.containerId, true);
        await transitionSandboxLifecycleState({
          sandboxId: sandbox.id,
          nextState: SandboxLifecycleState.ACTIVE,
          allowFromMissing: true,
        });
        await refreshSandboxTTL(sandbox.id, sandbox.chatId);

        return sandbox.id;
      } catch (error) {
        const err = ensureError(error);
        await setContainerStatus(sandbox.containerId, false);
        await transitionSandboxLifecycleState({
          sandboxId: sandbox.id,
          nextState: SandboxLifecycleState.FAILED,
          reason: err.message,
          allowFromMissing: true,
        });
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
          "Recovered running sandbox via runtime metadata, rehydrating Redis state",
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
        await transitionSandboxLifecycleState({
          sandboxId,
          nextState: SandboxLifecycleState.ACTIVE,
          allowFromMissing: true,
        });
        await setContainerStatus(chatContainer.Id, true);
        return sandboxId;
      }
    }
  } catch (error) {
    logger.warn(
      { error: ensureError(error), chatId },
      "Runtime metadata-based sandbox recovery failed",
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
  const normalizedFramework = framework?.toLowerCase();

  if (normalizedFramework && !isValidFramework(normalizedFramework)) {
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

      let sandboxId: string | null = null;
      let containerId: string | null = null;
      let sandboxActivated = false;
      try {
        const doubleCheckId = await getActiveSandbox(chatId);
        if (doubleCheckId) {
          return doubleCheckId;
        }

        sandboxId = nanoid(12);
        await transitionSandboxLifecycleState({
          sandboxId,
          nextState: SandboxLifecycleState.PROVISIONING,
          allowFromMissing: true,
        });

        const snapshotId = normalizedFramework
          ? getTemplateConfig(normalizedFramework)?.snapshotId
          : getDefaultSnapshotId();
        const container = await createContainer(
          userId,
          chatId,
          sandboxId,
          snapshotId,
          normalizedFramework,
        );
        containerId = container.id;

        await scaffoldTemplateWorkspace({
          containerId: container.id,
          sandboxId,
          framework: normalizedFramework,
          snapshotId,
        });

        const sandbox: SandboxInstance = {
          id: sandboxId,
          containerId: container.id,
          expiresAt: Date.now() + SANDBOX_TTL,
          userId,
          chatId,
          scaffoldedFramework: normalizedFramework,
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

        await ensureScaffoldGitignore(
          container.id,
          sandboxId,
          normalizedFramework,
        ).catch((error) =>
          logger.warn(
            { sandboxId, framework: normalizedFramework, error: ensureError(error) },
            "Failed to scaffold .gitignore (non-fatal)",
          ),
        );

        await saveSandboxState(sandbox);
        await transitionSandboxLifecycleState({
          sandboxId,
          nextState: SandboxLifecycleState.ACTIVE,
          allowFromMissing: true,
        });

        sandboxActivated = true;
        return sandboxId;
      } catch (provisionError) {
        if (!sandboxActivated && containerId) {
          await destroyContainer(containerId).catch((cleanupError) =>
            logger.warn(
              {
                sandboxId,
                containerId,
                error: ensureError(cleanupError),
              },
              "Failed to destroy sandbox after provisioning error",
            ),
          );
        }
        if (!sandboxActivated && sandboxId) {
          await transitionSandboxLifecycleState({
            sandboxId,
            nextState: SandboxLifecycleState.FAILED,
            reason: ensureError(provisionError).message,
            allowFromMissing: true,
          });
        }
        throw provisionError;
      } finally {
        await releaseDistributedLock(handle).catch((lockReleaseError) =>
          logger.warn(
            {
              chatId,
              sandboxId,
              error: ensureError(lockReleaseError),
            },
            "Failed to release sandbox provisioning lock",
          ),
        );
      }
    } catch (error) {
      logger.error({ error, userId, chatId }, "Failed to provision sandbox");
      throw new Error("Could not provision sandbox environment");
    }
  }

  throw new Error("Could not provision sandbox: lock acquisition timeout");
}

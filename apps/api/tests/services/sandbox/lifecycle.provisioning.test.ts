import { beforeEach, describe, expect, it, vi } from "vitest";

const refs = vi.hoisted(() => ({
  nanoid: vi.fn(() => "sandbox-1"),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  ensureError: vi.fn((error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ),
  saveSandboxState: vi.fn(),
  getActiveSandboxState: vi.fn(),
  refreshSandboxTTL: vi.fn(),
  deleteSandboxState: vi.fn(),
  createContainer: vi.fn(),
  destroyContainer: vi.fn(),
  getContainer: vi.fn(),
  initializeWorkspaceWithFiles: vi.fn(),
  listContainers: vi.fn(),
  execCommand: vi.fn(),
  inspectContainer: vi.fn(),
  restoreSandboxInstance: vi.fn(),
  redis: {
    get: vi.fn(),
  },
  acquireDistributedLock: vi.fn(),
  releaseDistributedLock: vi.fn(),
  getTemplateConfig: vi.fn(),
  getDefaultSnapshotId: vi.fn(),
  isValidFramework: vi.fn(),
  loadTemplateFiles: vi.fn(),
  deleteContainerStatus: vi.fn(),
  getContainerStatus: vi.fn(),
  setContainerStatus: vi.fn(),
  transitionSandboxLifecycleState: vi.fn(),
}));

vi.mock("nanoid", () => ({
  nanoid: refs.nanoid,
}));

vi.mock("../../../services/sandbox/state.service.js", () => ({
  saveSandboxState: refs.saveSandboxState,
  getActiveSandboxState: refs.getActiveSandboxState,
  refreshSandboxTTL: refs.refreshSandboxTTL,
  deleteSandboxState: refs.deleteSandboxState,
}));

vi.mock("../../../services/sandbox/sandbox-runtime.service.js", () => ({
  createContainer: refs.createContainer,
  destroyContainer: refs.destroyContainer,
  getContainer: refs.getContainer,
  initializeWorkspaceWithFiles: refs.initializeWorkspaceWithFiles,
  listContainers: refs.listContainers,
  execCommand: refs.execCommand,
  inspectContainer: refs.inspectContainer,
  CONTAINER_WORKDIR: "/vercel/sandbox/edward",
}));

vi.mock("../../../services/sandbox/backup.service.js", () => ({
  restoreSandboxInstance: refs.restoreSandboxInstance,
}));

vi.mock("../../../lib/redis.js", () => ({
  redis: refs.redis,
}));

vi.mock("../../../lib/distributedLock.js", () => ({
  acquireDistributedLock: refs.acquireDistributedLock,
  releaseDistributedLock: refs.releaseDistributedLock,
}));

vi.mock("../../../services/sandbox/templates/template.registry.js", () => ({
  getTemplateConfig: refs.getTemplateConfig,
  getDefaultSnapshotId: refs.getDefaultSnapshotId,
  isValidFramework: refs.isValidFramework,
}));

vi.mock("../../../services/sandbox/templates/template.loader.js", () => ({
  loadTemplateFiles: refs.loadTemplateFiles,
}));

vi.mock("../../../services/sandbox/lifecycle/runtimeState.store.js", () => ({
  deleteContainerStatus: refs.deleteContainerStatus,
  getContainerStatus: refs.getContainerStatus,
  setContainerStatus: refs.setContainerStatus,
}));

vi.mock("../../../services/sandbox/lifecycle/runtimeLifecycle.store.js", () => ({
  SandboxLifecycleState: {
    PROVISIONING: "PROVISIONING",
    ACTIVE: "ACTIVE",
    FAILED: "FAILED",
  },
  transitionSandboxLifecycleState: refs.transitionSandboxLifecycleState,
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: refs.logger,
}));

vi.mock("../../../utils/error.js", () => ({
  ensureError: refs.ensureError,
}));

describe("sandbox provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refs.getActiveSandboxState.mockResolvedValue(null);
    refs.redis.get.mockResolvedValue(null);
    refs.acquireDistributedLock.mockResolvedValue({ key: "lock-1" });
    refs.releaseDistributedLock.mockResolvedValue(undefined);
    refs.isValidFramework.mockReturnValue(true);
    refs.getTemplateConfig.mockReturnValue({ snapshotId: undefined });
    refs.getDefaultSnapshotId.mockReturnValue(undefined);
    refs.createContainer.mockResolvedValue({ id: "container-1" });
    refs.destroyContainer.mockResolvedValue(undefined);
    refs.getContainer.mockReturnValue({ id: "container-1" });
    refs.execCommand.mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
    refs.loadTemplateFiles.mockResolvedValue({ "package.json": "{}" });
    refs.initializeWorkspaceWithFiles.mockRejectedValue(
      new Error("scaffold failed"),
    );
    refs.transitionSandboxLifecycleState.mockResolvedValue(undefined);
  });

  it("destroys the created sandbox if provisioning fails after container creation", async () => {
    const { provisionSandbox } = await import(
      "../../../services/sandbox/lifecycle/provisioning.js"
    );

    await expect(
      provisionSandbox("user-1", "chat-1", "vanilla"),
    ).rejects.toThrow("Could not provision sandbox environment");

    expect(refs.destroyContainer).toHaveBeenCalledWith("container-1");
    expect(refs.releaseDistributedLock).toHaveBeenCalled();
  });

  it("does not destroy an activated sandbox when releasing the lock fails", async () => {
    refs.initializeWorkspaceWithFiles.mockResolvedValue(undefined);
    refs.releaseDistributedLock.mockRejectedValueOnce(new Error("unlock failed"));

    const { provisionSandbox } = await import(
      "../../../services/sandbox/lifecycle/provisioning.js"
    );

    await expect(
      provisionSandbox("user-1", "chat-1", "vanilla"),
    ).resolves.toBe("sandbox-1");

    expect(refs.destroyContainer).not.toHaveBeenCalled();
    expect(refs.transitionSandboxLifecycleState).toHaveBeenCalledWith({
      sandboxId: "sandbox-1",
      nextState: "ACTIVE",
      allowFromMissing: true,
    });
    expect(refs.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        sandboxId: "sandbox-1",
      }),
      "Failed to release sandbox provisioning lock",
    );
  });
});

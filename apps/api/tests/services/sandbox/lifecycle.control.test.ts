import { beforeEach, describe, expect, it, vi } from "vitest";

const refs = vi.hoisted(() => {
  const logger = {
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    cleanupExpiredSandboxContainers: vi.fn(async (): Promise<void> => {}),
    pingDocker: vi.fn(async () => true),
    createLogger: vi.fn(() => logger),
    logger,
    ensureError: vi.fn((error: unknown) =>
      error instanceof Error ? error : new Error(String(error)),
    ),
  };
});

vi.mock("../../../services/sandbox/lifecycle/cleanup.js", () => ({
  cleanupExpiredSandboxContainers: refs.cleanupExpiredSandboxContainers,
}));

vi.mock("../../../services/sandbox/sandbox-runtime.service.js", () => ({
  pingDocker: refs.pingDocker,
}));

vi.mock("../../../utils/logger.js", () => ({
  Environment: {
    Development: "development",
    Production: "production",
    Test: "test",
  },
  createLogger: refs.createLogger,
}));

vi.mock("../../../utils/error.js", () => ({
  ensureError: refs.ensureError,
}));

describe("sandbox lifecycle control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.resetModules();

    refs.cleanupExpiredSandboxContainers.mockResolvedValue(undefined);
    refs.pingDocker.mockResolvedValue(true);
    refs.createLogger.mockReturnValue(refs.logger);
  });

  it("reports runtime availability from the configured sandbox health check", async () => {
    const { isSandboxRuntimeAvailable } = await import(
      "../../../services/sandbox/lifecycle/control.js"
    );

    refs.pingDocker.mockResolvedValueOnce(true);
    await expect(isSandboxRuntimeAvailable()).resolves.toBe(true);

    refs.pingDocker.mockResolvedValueOnce(false);
    await expect(isSandboxRuntimeAvailable()).resolves.toBe(false);

    expect(refs.pingDocker).toHaveBeenCalledTimes(2);
  });

  it("continues startup and schedules background retries when the runtime is unavailable", async () => {
    refs.pingDocker.mockResolvedValueOnce(false);
    const intervalToken = {
      unref: vi.fn(),
    };
    const setIntervalSpy = vi
      .spyOn(globalThis, "setInterval")
      .mockReturnValue(intervalToken as unknown as NodeJS.Timeout);
    const clearIntervalSpy = vi
      .spyOn(globalThis, "clearInterval")
      .mockImplementation(() => undefined);

    const { initSandboxService, shutdownSandboxService } = await import(
      "../../../services/sandbox/lifecycle/control.js"
    );

    await expect(initSandboxService()).resolves.toBeUndefined();
    expect(refs.cleanupExpiredSandboxContainers).not.toHaveBeenCalled();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(refs.logger.error).toHaveBeenCalledTimes(1);

    await shutdownSandboxService();
    expect(intervalToken.unref).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalToken);
  });

  it("runs one initialization for concurrent calls and registers one cleanup interval", async () => {
    let resolveCleanup: (() => void) | undefined;
    refs.cleanupExpiredSandboxContainers.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCleanup = () => resolve();
        }),
    );

    const intervalToken = {
      unref: vi.fn(),
    };
    const setIntervalSpy = vi
      .spyOn(globalThis, "setInterval")
      .mockReturnValue(intervalToken as unknown as NodeJS.Timeout);
    const clearIntervalSpy = vi
      .spyOn(globalThis, "clearInterval")
      .mockImplementation(() => undefined);

    const { initSandboxService, shutdownSandboxService } = await import(
      "../../../services/sandbox/lifecycle/control.js"
    );

    const firstInit = initSandboxService();
    const secondInit = initSandboxService();

    await vi.waitFor(() => {
      expect(refs.pingDocker).toHaveBeenCalledTimes(1);
      expect(refs.cleanupExpiredSandboxContainers).toHaveBeenCalledTimes(1);
    });
    expect(setIntervalSpy).not.toHaveBeenCalled();

    resolveCleanup?.();
    await Promise.all([firstInit, secondInit]);

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    await shutdownSandboxService();
    expect(intervalToken.unref).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalToken);
  });
});

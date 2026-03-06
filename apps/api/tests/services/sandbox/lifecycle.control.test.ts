import { beforeEach, describe, expect, it, vi } from "vitest";

const refs = vi.hoisted(() => {
  const logger = {
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    config: {
      sandbox: {
        runtime: "vercel",
        required: true,
      },
    },
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

vi.mock("../../../app.config.js", () => ({
  config: refs.config,
}));

function createIntervalToken(): ReturnType<typeof setInterval> {
  const intervalToken = setInterval(() => undefined, 60_000);
  clearInterval(intervalToken);
  vi.spyOn(intervalToken, "unref").mockReturnValue(intervalToken);
  return intervalToken;
}

describe("sandbox lifecycle control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.resetModules();

    refs.config.sandbox.runtime = "vercel";
    refs.config.sandbox.required = true;
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

  it("fails fast when the runtime is unavailable and sandboxing is required", async () => {
    refs.pingDocker.mockResolvedValueOnce(false);
    const intervalToken = createIntervalToken();
    const setIntervalSpy = vi
      .spyOn(globalThis, "setInterval")
      .mockReturnValue(intervalToken);

    const { initSandboxService } = await import(
      "../../../services/sandbox/lifecycle/control.js"
    );

    await expect(initSandboxService()).rejects.toThrow(
      'Sandbox runtime "vercel" is required but unavailable during startup.',
    );
    expect(refs.cleanupExpiredSandboxContainers).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(refs.logger.error).toHaveBeenCalledTimes(1);
  });

  it("continues startup and schedules background retries when the runtime is optional", async () => {
    refs.config.sandbox.required = false;
    refs.pingDocker.mockResolvedValueOnce(false);
    const intervalToken = createIntervalToken();
    const setIntervalSpy = vi
      .spyOn(globalThis, "setInterval")
      .mockReturnValue(intervalToken);
    const clearIntervalSpy = vi
      .spyOn(globalThis, "clearInterval")
      .mockImplementation(() => undefined);

    const { initSandboxService, shutdownSandboxService } = await import(
      "../../../services/sandbox/lifecycle/control.js"
    );

    await expect(initSandboxService()).resolves.toBeUndefined();
    expect(refs.cleanupExpiredSandboxContainers).not.toHaveBeenCalled();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(refs.logger.warn).toHaveBeenCalledTimes(1);

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

    const intervalToken = createIntervalToken();
    const setIntervalSpy = vi
      .spyOn(globalThis, "setInterval")
      .mockReturnValue(intervalToken);
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

import { beforeEach, describe, expect, it, vi } from "vitest";

const refs = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const closeMock = vi.fn((callback: () => void) => callback());
  const listenMock = vi.fn((_port: number, callback: () => void) => {
    void callback();
    return {
      close: closeMock,
    };
  });

  return {
    handlers,
    closeMock,
    listenMock,
    app: { listen: listenMock },
    createHttpApp: vi.fn(() => ({ listen: listenMock })),
    initSandboxService: vi.fn(async () => undefined),
    shutdownSandboxService: vi.fn(async () => undefined),
    shutdownRedisPubSub: vi.fn(async () => undefined),
    redisQuit: vi.fn(async () => undefined),
    registerProcessHandlerOnce: vi.fn(
      (key: string, _signal: string, callback: (...args: unknown[]) => void) => {
        refs.handlers.set(key, callback);
      },
    ),
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
    sentry: {
      captureException: vi.fn(),
    },
    config: {
      server: {
        port: 9999,
        environment: "test",
        trustProxy: false,
        isDevelopment: vi.fn(() => false),
        isProduction: vi.fn(() => false),
      },
      cors: {
        origins: ["https://example.com"],
      },
    },
  };
});

vi.mock("../utils/sentry.js", () => ({
  captureException: refs.sentry.captureException,
}));

vi.mock("../services/sandbox/lifecycle/control.js", () => ({
  initSandboxService: refs.initSandboxService,
  shutdownSandboxService: refs.shutdownSandboxService,
}));

vi.mock("../lib/redis.js", () => ({
  redis: {
    quit: refs.redisQuit,
  },
}));

vi.mock("../lib/redisPubSub.js", () => ({
  shutdownRedisPubSub: refs.shutdownRedisPubSub,
}));

vi.mock("../utils/logger.js", () => ({
  Environment: {
    DEVELOPMENT: "development",
    PRODUCTION: "production",
    TEST: "test",
  },
  createLogger: vi.fn(() => refs.logger),
}));

vi.mock("../app.config.js", () => ({
  config: refs.config,
}));

vi.mock("../utils/processHandlers.js", () => ({
  registerProcessHandlerOnce: refs.registerProcessHandlerOnce,
}));

vi.mock("../server/http/app.factory.js", () => ({
  createHttpApp: refs.createHttpApp,
}));

describe("server.http bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    refs.handlers.clear();
  });

  it("bootstraps app, initializes sandbox service, and registers process handlers", async () => {
    const processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    await import("../server.http.js");

    expect(refs.createHttpApp).toHaveBeenCalledWith({
      isDev: false,
      isProd: false,
      allowedOrigins: ["https://example.com"],
      environment: "test",
      trustProxy: false,
    });
    expect(refs.initSandboxService).toHaveBeenCalledTimes(1);
    expect(refs.registerProcessHandlerOnce).toHaveBeenCalledTimes(4);
    expect(refs.logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Edward API v"),
    );
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it("runs cleanup and exits with code 0 on SIGTERM", async () => {
    const processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    await import("../server.http.js");
    const sigtermHandler = refs.handlers.get("api:SIGTERM");
    expect(sigtermHandler).toBeDefined();

    sigtermHandler?.();

    await vi.waitFor(() => {
      expect(refs.closeMock).toHaveBeenCalledTimes(1);
      expect(refs.shutdownSandboxService).toHaveBeenCalledTimes(1);
      expect(refs.shutdownRedisPubSub).toHaveBeenCalledTimes(1);
      expect(refs.redisQuit).toHaveBeenCalledTimes(1);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  it("ignores duplicate shutdown signals while cleanup is in progress", async () => {
    const processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    refs.closeMock.mockImplementationOnce(() => undefined);

    await import("../server.http.js");
    const sigtermHandler = refs.handlers.get("api:SIGTERM");
    expect(sigtermHandler).toBeDefined();

    sigtermHandler?.();
    sigtermHandler?.();

    expect(refs.closeMock).toHaveBeenCalledTimes(1);
    const closeCallback = refs.closeMock.mock.calls[0]?.[0];
    if (typeof closeCallback === "function") {
      closeCallback();
    }

    await vi.waitFor(() => {
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  it("captures unhandled rejections and initiates graceful shutdown", async () => {
    const processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    await import("../server.http.js");
    const rejectionHandler = refs.handlers.get("api:unhandledRejection");
    expect(rejectionHandler).toBeDefined();

    rejectionHandler?.("boom");

    await vi.waitFor(() => {
      expect(refs.logger.fatal).toHaveBeenCalledWith(
        { reason: "boom" },
        "Unhandled Rejection",
      );
      expect(refs.sentry.captureException).toHaveBeenCalledWith("boom");
      expect(refs.closeMock).toHaveBeenCalledTimes(1);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  it("exits with code 1 when sandbox initialization fails", async () => {
    const processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    refs.initSandboxService.mockRejectedValueOnce(new Error("init failed"));

    await import("../server.http.js");

    await vi.waitFor(() => {
      expect(refs.logger.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});

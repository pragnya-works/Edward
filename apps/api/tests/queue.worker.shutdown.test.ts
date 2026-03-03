import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGracefulShutdown } from "../queue.worker.shutdown.js";

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("queue.worker graceful shutdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("cleans up workers and exits with code 0 on success", async () => {
    const buildWorker = { close: vi.fn(async () => undefined) };
    const agentRunWorker = { close: vi.fn(async () => undefined) };
    const pubClient = { quit: vi.fn(async () => undefined) };
    const logger = { error: vi.fn() };
    const processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    const gracefulShutdown = createGracefulShutdown({
      buildWorker,
      agentRunWorker,
      pubClient,
      scheduledFlushInterval: 1 as unknown as ReturnType<typeof setInterval>,
      staleRunReaperInterval: 2 as unknown as ReturnType<typeof setInterval>,
      logger,
      shutdownTimeoutMs: 5_000,
    });

    await gracefulShutdown();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
    expect(buildWorker.close).toHaveBeenCalledTimes(1);
    expect(agentRunWorker.close).toHaveBeenCalledTimes(1);
    expect(pubClient.quit).toHaveBeenCalledTimes(1);
    expect(processExitSpy).toHaveBeenCalledWith(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("returns the same promise for concurrent invocations", async () => {
    const buildDeferred = createDeferred();
    const buildWorker = { close: vi.fn(() => buildDeferred.promise) };
    const agentRunWorker = { close: vi.fn(async () => undefined) };
    const pubClient = { quit: vi.fn(async () => undefined) };
    const logger = { error: vi.fn() };
    const processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    const gracefulShutdown = createGracefulShutdown({
      buildWorker,
      agentRunWorker,
      pubClient,
      scheduledFlushInterval: 1 as unknown as ReturnType<typeof setInterval>,
      staleRunReaperInterval: 2 as unknown as ReturnType<typeof setInterval>,
      logger,
      shutdownTimeoutMs: 5_000,
    });

    const first = gracefulShutdown(0);
    const second = gracefulShutdown(1);

    expect(buildWorker.close).toHaveBeenCalledTimes(1);

    buildDeferred.resolve(undefined);
    await Promise.all([first, second]);

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("logs failed cleanup operations and exits with code 1", async () => {
    const buildWorker = { close: vi.fn(async () => undefined) };
    const agentRunWorker = { close: vi.fn(async () => undefined) };
    const pubClient = { quit: vi.fn(async () => {
      throw new Error("quit failed");
    }) };
    const logger = { error: vi.fn() };
    const processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    const gracefulShutdown = createGracefulShutdown({
      buildWorker,
      agentRunWorker,
      pubClient,
      scheduledFlushInterval: 1 as unknown as ReturnType<typeof setInterval>,
      staleRunReaperInterval: 2 as unknown as ReturnType<typeof setInterval>,
      logger,
      shutdownTimeoutMs: 5_000,
    });

    await gracefulShutdown();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        timedOutOperations: ["pubClientQuit"],
        timeoutMs: 5_000,
      }),
      "[Worker] Graceful shutdown cleanup timed out",
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("times out incomplete cleanup operations and exits with code 1", async () => {
    const deferred = createDeferred();
    const buildWorker = { close: vi.fn(() => deferred.promise) };
    const agentRunWorker = { close: vi.fn(async () => undefined) };
    const pubClient = { quit: vi.fn(async () => undefined) };
    const logger = { error: vi.fn() };
    const processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    const gracefulShutdown = createGracefulShutdown({
      buildWorker,
      agentRunWorker,
      pubClient,
      scheduledFlushInterval: 1 as unknown as ReturnType<typeof setInterval>,
      staleRunReaperInterval: 2 as unknown as ReturnType<typeof setInterval>,
      logger,
      shutdownTimeoutMs: 25,
    });

    const pending = gracefulShutdown();
    await vi.advanceTimersByTimeAsync(26);
    await pending;

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        timedOutOperations: ["buildWorkerClose"],
        timeoutMs: 25,
      }),
      "[Worker] Graceful shutdown cleanup timed out",
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});

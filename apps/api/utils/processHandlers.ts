const processHandlerState = globalThis as typeof globalThis & {
  __edwardProcessHandlers?: Map<string, (...args: unknown[]) => void>;
};

export function registerProcessHandlerOnce(
  key: string,
  event: "SIGINT" | "SIGTERM" | "uncaughtException" | "unhandledRejection",
  handler: (...args: unknown[]) => void,
): void {
  const registry = processHandlerState.__edwardProcessHandlers ?? new Map();
  processHandlerState.__edwardProcessHandlers = registry;

  const existing = registry.get(key);
  if (existing) {
    process.off(event, existing as never);
  }

  process.on(event, handler as never);
  registry.set(key, handler);
}

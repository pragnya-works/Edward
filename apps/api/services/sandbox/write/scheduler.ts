import {
  clearScheduledFlush,
  scheduleSandboxFlush as scheduleSandboxFlushInternal,
} from "./flush.scheduler.js";

export function clearWriteTimers(sandboxId: string): void {
  void clearScheduledFlush(sandboxId);
}

export function scheduleSandboxFlush(
  sandboxId: string,
  immediate: boolean,
): void {
  scheduleSandboxFlushInternal(sandboxId, immediate);
}

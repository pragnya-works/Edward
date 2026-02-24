import {
  emitChange,
  subscribeToLockBroadcasts,
  submissionLockRuntime,
} from "@/lib/chat/submissionLock.shared";
import { releaseAllOwnedLocks } from "@/lib/chat/submissionLock.ownership";

export function ensureStorageListener(): void {
  if (submissionLockRuntime.storageListenerAttached || typeof window === "undefined") {
    return;
  }

  subscribeToLockBroadcasts(() => {
    emitChange();
  });

  submissionLockRuntime.storageListenerAttached = true;
}

export function ensureLifecycleListener(): void {
  if (submissionLockRuntime.lifecycleListenerAttached || typeof window === "undefined") {
    return;
  }

  const releaseAll = () => {
    releaseAllOwnedLocks();
  };

  window.addEventListener("pagehide", releaseAll);
  window.addEventListener("beforeunload", releaseAll);
  submissionLockRuntime.lifecycleListenerAttached = true;
}

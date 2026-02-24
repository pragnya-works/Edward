import { useEffect, useMemo, useState } from "react";
import {
  getChatSubmissionLockSnapshot,
  subscribeChatSubmissionLock,
  type ChatSubmissionLockSnapshot,
} from "@/lib/chat/submissionLock";

export function useChatSubmissionLock(): ChatSubmissionLockSnapshot {
  const [now, setNow] = useState(() => Date.now());

  const snapshot = useMemo(
    () => getChatSubmissionLockSnapshot(now),
    [now],
  );
  const lockExpiresAtMs = snapshot.expiresAt?.getTime() ?? null;

  useEffect(
    () =>
      subscribeChatSubmissionLock(() => {
        setNow(Date.now());
      }),
    [],
  );

  useEffect(() => {
    if (!snapshot.isLocked) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    const expiryTimeoutId = window.setTimeout(() => {
      setNow(Date.now());
    }, Math.max((lockExpiresAtMs ?? Date.now()) - Date.now(), 0));

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(expiryTimeoutId);
    };
  }, [lockExpiresAtMs, snapshot.isLocked]);

  return snapshot;
}

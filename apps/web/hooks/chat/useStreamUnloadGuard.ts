import { useEffect } from "react";
import type { StreamState } from "@edward/shared/chat/types";
import { useChatStreamStore } from "@/stores/chatStream/store";

function isRunInProgress(stream: StreamState): boolean {
  return (
    stream.isStreaming ||
    stream.isThinking ||
    stream.isSandboxing ||
    stream.activeFiles.length > 0 ||
    stream.installingDeps.length > 0
  );
}

export function useStreamUnloadGuard(): void {
  const shouldWarn = useChatStreamStore((s) =>
    Object.values(s.streams).some(isRunInProgress),
  );

  useEffect(() => {
    if (!shouldWarn) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldWarn]);
}

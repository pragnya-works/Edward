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
  const shouldWarnBeforeUnload = useChatStreamStore((state) =>
    Object.values(state.streams).some((stream) => isRunInProgress(stream)),
  );

  useEffect(() => {
    if (!shouldWarnBeforeUnload) {
      return;
    }

    const previousBeforeUnload = window.onbeforeunload;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (typeof previousBeforeUnload === "function") {
        const previousResult = previousBeforeUnload.call(window, event);
        if (typeof previousResult === "string") {
          return previousResult;
        }
      }
      event.preventDefault();
      return "";
    };
    window.onbeforeunload = handleBeforeUnload;

    return () => {
      if (window.onbeforeunload === handleBeforeUnload) {
        window.onbeforeunload = previousBeforeUnload;
      }
    };
  }, [shouldWarnBeforeUnload]);
}

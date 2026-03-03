"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { StreamState } from "@edward/shared/chat/types";
import {
  useChatStreamController,
  type ChatStreamActionsContextValue,
} from "@/stores/chatStream/controller";
import { useChatStreamStore } from "@/stores/chatStream/store";

const ChatStreamActionsContext =
  createContext<ChatStreamActionsContextValue | null>(null);

function isRunInProgress(stream: StreamState): boolean {
  return (
    stream.isStreaming ||
    stream.isThinking ||
    stream.isSandboxing ||
    stream.activeFiles.length > 0 ||
    stream.installingDeps.length > 0
  );
}

export function ChatStreamProvider({ children }: { children: ReactNode }) {
  const { actionsValue } = useChatStreamController();
  const streams = useChatStreamStore((state) => state.streams);

  const shouldWarnBeforeUnload = useMemo(
    () => Object.values(streams).some((stream) => isRunInProgress(stream)),
    [streams],
  );

  useEffect(() => {
    if (!shouldWarnBeforeUnload) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldWarnBeforeUnload]);

  return (
    <ChatStreamActionsContext.Provider value={actionsValue}>
      {children}
    </ChatStreamActionsContext.Provider>
  );
}

export function useChatStreamActions() {
  const ctx = useContext(ChatStreamActionsContext);
  if (!ctx) {
    throw new Error(
      "useChatStreamActions must be used within a ChatStreamProvider",
    );
  }
  return ctx;
}

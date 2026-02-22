"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { StreamState } from "@/lib/chatTypes";
import {
  type ChatStreamActionsContextValue,
  type ChatStreamStateContextValue,
  useChatStreamController,
} from "./useChatStreamController";

const ChatStreamStateContext =
  createContext<ChatStreamStateContextValue | null>(null);
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
  const { stateValue, actionsValue } = useChatStreamController();
  const shouldWarnBeforeUnload = useMemo(
    () => Object.values(stateValue.streams).some((stream) => isRunInProgress(stream)),
    [stateValue.streams],
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
    <ChatStreamStateContext.Provider value={stateValue}>
      <ChatStreamActionsContext.Provider value={actionsValue}>
        {children}
      </ChatStreamActionsContext.Provider>
    </ChatStreamStateContext.Provider>
  );
}

export function useChatStream() {
  const ctx = useContext(ChatStreamStateContext);
  if (!ctx) {
    throw new Error("useChatStream must be used within a ChatStreamProvider");
  }
  return ctx;
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

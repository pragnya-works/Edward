"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  useChatStreamController,
  type ChatStreamActionsContextValue,
} from "@/stores/chatStream/controller";
import { useStreamUnloadGuard } from "@/hooks/chat/useStreamUnloadGuard";

const ChatStreamActionsContext =
  createContext<ChatStreamActionsContextValue | null>(null);

export function ChatStreamProvider({ children }: { children: ReactNode }) {
  const { actionsValue } = useChatStreamController();
  useStreamUnloadGuard();

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

"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  type ChatStreamActionsContextValue,
  type ChatStreamStateContextValue,
  useChatStreamController,
} from "./useChatStreamController";

const ChatStreamStateContext =
  createContext<ChatStreamStateContextValue | null>(null);
const ChatStreamActionsContext =
  createContext<ChatStreamActionsContextValue | null>(null);

export function ChatStreamProvider({ children }: { children: ReactNode }) {
  const { stateValue, actionsValue } = useChatStreamController();

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

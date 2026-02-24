"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type {
  ChatMessage as ChatMessageType,
  StreamState,
} from "@edward/shared/chat/types";

interface ChatWorkspaceContextValue {
  chatId: string;
  projectName: string | null;
  messages: ChatMessageType[];
  stream: StreamState;
  retryDisabled: boolean;
  onRetryStreamError: () => boolean;
  onRetryAssistantMessage: (assistantMessageId: string) => boolean;
}

const ChatWorkspaceContext = createContext<ChatWorkspaceContextValue | null>(null);

interface ChatWorkspaceProviderProps {
  value: ChatWorkspaceContextValue;
  children: ReactNode;
}

export function ChatWorkspaceProvider({
  value,
  children,
}: ChatWorkspaceProviderProps) {
  return (
    <ChatWorkspaceContext.Provider value={value}>
      {children}
    </ChatWorkspaceContext.Provider>
  );
}

export function useChatWorkspaceContext(): ChatWorkspaceContextValue {
  const context = useContext(ChatWorkspaceContext);
  if (!context) {
    throw new Error(
      "useChatWorkspaceContext must be used within a ChatWorkspaceProvider",
    );
  }
  return context;
}

export function useOptionalChatWorkspaceContext(): ChatWorkspaceContextValue | null {
  return useContext(ChatWorkspaceContext);
}

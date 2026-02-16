"use client";

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useRef,
  useReducer,
  type ReactNode,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, type MessageContent } from "@/lib/api";
import {
  INITIAL_STREAM_STATE,
  type StreamState,
  type MetaEvent,
  type ChatMessage,
} from "@/lib/chatTypes";
import { buildMessageFromStream } from "@/lib/streamToMessage";
import { streamReducer } from "./chatStream.reducer";
import {
  processStreamResponse,
  type ProcessedStreamResult,
} from "./chatStream.processor";

interface ChatStreamStateContextValue {
  stream: StreamState;
  activeChatId: string | null;
}

interface ChatStreamActionsContextValue {
  startStream: (
    content: MessageContent,
    opts?: { chatId?: string; model?: string },
  ) => void;
  cancelStream: () => void;
  resetStream: () => void;
  setActiveChatId: (id: string | null) => void;
  onMetaRef: React.MutableRefObject<((meta: MetaEvent) => void) | null>;
}

const ChatStreamStateContext =
  createContext<ChatStreamStateContextValue | null>(null);
const ChatStreamActionsContext =
  createContext<ChatStreamActionsContextValue | null>(null);

export function ChatStreamProvider({ children }: { children: ReactNode }) {
  const [streamState, dispatch] = useReducer(
    streamReducer,
    INITIAL_STREAM_STATE,
  );
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();
  const [activeChatId, setActiveChatIdState] = useReducer(
    (_: string | null, id: string | null) => id,
    null,
  );
  const onMetaRef = useRef<((meta: MetaEvent) => void) | null>(null);
  const thinkingStartRef = useRef<number | null>(null);

  const setActiveChatId = useCallback((id: string | null) => {
    setActiveChatIdState(id);
  }, []);

  const resetStream = useCallback(() => {
    dispatch({ type: "RESET" });
    thinkingStartRef.current = null;
  }, []);

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    dispatch({ type: "STOP_STREAMING" });
  }, []);

  const processStream = useCallback(
    async (
      response: Response,
    ): Promise<ProcessedStreamResult | null> => {
      return processStreamResponse({
        response,
        dispatch,
        onMetaRef,
        thinkingStartRef,
      });
    },
    [dispatch],
  );

  const mutation = useMutation({
    mutationFn: async ({
      content,
      chatId,
      model,
    }: {
      content: MessageContent;
      chatId?: string;
      model?: string;
    }) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ type: "START_STREAMING" });
      thinkingStartRef.current = null;

      const body: Record<string, unknown> = { content };
      if (chatId) body.chatId = chatId;
      if (model) body.model = model;

      const response = await fetch(`${API_BASE_URL}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          (errorData as { message?: string }).message ||
            `Request failed: ${response.status}`,
        );
      }

      const streamResult = await processStream(response);
      const metaEvt = streamResult?.meta;

      dispatch({ type: "STOP_STREAMING" });

      if (metaEvt?.chatId && streamResult) {
        const augmentedStreamState: StreamState = {
          ...INITIAL_STREAM_STATE,
          streamingText: streamResult.text,
          thinkingText: streamResult.thinking,
          completedFiles: streamResult.completedFiles,
          installingDeps: streamResult.installingDeps,
          command: streamResult.command,
          metrics: streamResult.metrics,
          previewUrl: streamResult.previewUrl,
          meta: metaEvt,
        };
        const optimisticMessage = buildMessageFromStream(
          augmentedStreamState,
          metaEvt,
        );

        if (optimisticMessage) {
          queryClient.setQueryData<ChatMessage[]>(
            ["chatHistory", metaEvt.chatId],
            (oldMessages = []) => {
              const exists = oldMessages.some(
                (msg) => msg.id === optimisticMessage.id,
              );
              if (exists) return oldMessages;
              return [...oldMessages, optimisticMessage];
            },
          );
        }

        await queryClient.refetchQueries({
          queryKey: ["chatHistory", metaEvt.chatId],
        });
        queryClient.invalidateQueries({ queryKey: ["recentChats"] });

        await new Promise((resolve) => setTimeout(resolve, 150));

        dispatch({ type: "RESET" });
      }

      return metaEvt;
    },
    onError: (err: Error) => {
      if (err.name === "AbortError") {
        dispatch({ type: "STOP_STREAMING" });
        return;
      }
      dispatch({ type: "STOP_STREAMING" });
      dispatch({ type: "SET_ERROR", error: err.message });
    },
    onSettled: () => {
      abortRef.current = null;
    },
  });

  const startStream = useCallback(
    (content: MessageContent, opts?: { chatId?: string; model?: string }) => {
      mutation.mutate({
        content,
        chatId: opts?.chatId,
        model: opts?.model,
      });
    },
    [mutation],
  );

  const actions = useMemo(
    () => ({
      startStream,
      cancelStream,
      resetStream,
      setActiveChatId,
      onMetaRef,
    }),
    [startStream, cancelStream, resetStream, setActiveChatId],
  );

  return (
    <ChatStreamStateContext.Provider
      value={{ stream: streamState, activeChatId }}
    >
      <ChatStreamActionsContext.Provider value={actions}>
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

export function useChatStreamContext() {
  const state = useChatStream();
  const actions = useChatStreamActions();
  return { ...state, ...actions };
}

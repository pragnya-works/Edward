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
import {
  postChatMessageStream,
  type MessageContent,
  type SendMessageRequest,
} from "@/lib/api";
import {
  INITIAL_STREAM_STATE,
  type StreamState,
  type MetaEvent,
  type ChatMessage,
} from "@/lib/chatTypes";
import { buildMessageFromStream } from "@/lib/streamToMessage";
import {
  StreamActionType,
  streamReducer,
  type StreamMap,
} from "./chatStream.reducer";
import { processStreamResponse } from "./chatStream.processor";
import { queryKeys } from "@/lib/queryKeys";

const ABORT_ERROR_NAME = "AbortError";
const PENDING_CHAT_ID_PREFIX = "pending_";

interface ChatStreamStateContextValue {
  streams: StreamMap;
  activeChatId: string | null;
}

interface ChatStreamActionsContextValue {
  startStream: (
    content: MessageContent,
    opts?: { chatId?: string; model?: string },
  ) => void;
  cancelStream: (chatId: string) => void;
  resetStream: (chatId: string) => void;
  setActiveChatId: (id: string | null) => void;
  onMetaRef: React.MutableRefObject<((meta: MetaEvent) => void) | null>;
  getStreamForChat: (chatId: string | undefined) => StreamState;
}

const ChatStreamStateContext =
  createContext<ChatStreamStateContextValue | null>(null);
const ChatStreamActionsContext =
  createContext<ChatStreamActionsContextValue | null>(null);

const INITIAL_STREAMS: StreamMap = {};

export function ChatStreamProvider({ children }: { children: ReactNode }) {
  const [streams, dispatch] = useReducer(streamReducer, INITIAL_STREAMS);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const queryClient = useQueryClient();
  const [activeChatId, setActiveChatIdState] = useReducer(
    (_: string | null, id: string | null) => id,
    null,
  );
  const onMetaRef = useRef<((meta: MetaEvent) => void) | null>(null);
  const streamsRef = useRef(streams);
  streamsRef.current = streams;

  const setActiveChatId = useCallback((id: string | null) => {
    setActiveChatIdState(id);
  }, []);

  const resetStream = useCallback((chatId: string) => {
    dispatch({ type: StreamActionType.REMOVE_STREAM, chatId });
  }, []);

  const cancelStream = useCallback((chatId: string) => {
    const controller = abortControllersRef.current.get(chatId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(chatId);
    }
    dispatch({ type: StreamActionType.STOP_STREAMING, chatId });
  }, []);

  const getStreamForChat = useCallback(
    (chatId: string | undefined): StreamState => {
      if (!chatId) return INITIAL_STREAM_STATE;
      return streamsRef.current[chatId] ?? INITIAL_STREAM_STATE;
    },
    [],
  );

  const mutation = useMutation({
    mutationFn: async ({
      content,
      chatId,
      model,
      streamKey,
    }: {
      content: MessageContent;
      chatId?: string;
      model?: string;
      streamKey: string;
    }) => {
      const controller = new AbortController();
      abortControllersRef.current.set(streamKey, controller);

      dispatch({ type: StreamActionType.START_STREAMING, chatId: streamKey });

      const thinkingRef = { current: null as number | null };

      const body: SendMessageRequest = { content, chatId, model };
      const response = await postChatMessageStream(body, controller.signal);

      let resolvedChatId = streamKey;

      const streamResult = await processStreamResponse({
        response,
        chatId: streamKey,
        dispatch,
        onMetaRef,
        thinkingStartRef: thinkingRef,
        onChatIdResolved: (realChatId: string) => {
          if (realChatId !== streamKey) {
            dispatch({
              type: StreamActionType.RENAME_STREAM,
              oldChatId: streamKey,
              newChatId: realChatId,
            });
            const ctrl = abortControllersRef.current.get(streamKey);
            if (ctrl) {
              abortControllersRef.current.delete(streamKey);
              abortControllersRef.current.set(realChatId, ctrl);
            }
            resolvedChatId = realChatId;
          }
        },
      });

      const metaEvt = streamResult?.meta;

      dispatch({ type: StreamActionType.STOP_STREAMING, chatId: resolvedChatId });

      if (metaEvt?.chatId && streamResult) {
        const augmentedStreamState: StreamState = {
          ...INITIAL_STREAM_STATE,
          streamingText: streamResult.text,
          thinkingText: streamResult.thinking,
          completedFiles: streamResult.completedFiles,
          installingDeps: streamResult.installingDeps,
          command: streamResult.command,
          webSearches: streamResult.webSearches,
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
            queryKeys.chatHistory.byChatId(metaEvt.chatId),
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
          queryKey: queryKeys.chatHistory.byChatId(metaEvt.chatId),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.recentChats.all });

        await new Promise((resolve) => setTimeout(resolve, 150));

        dispatch({ type: StreamActionType.REMOVE_STREAM, chatId: resolvedChatId });
      }

      return metaEvt;
    },
    onError: (err: Error, variables) => {
      const chatId = variables.streamKey;
      if (err.name === ABORT_ERROR_NAME) {
        dispatch({ type: StreamActionType.STOP_STREAMING, chatId });
        return;
      }
      dispatch({ type: StreamActionType.STOP_STREAMING, chatId });
      const apiError = err as Error & { status?: number };
      if (apiError.status === 429) {
        dispatch({
          type: StreamActionType.SET_ERROR,
          chatId,
          error: "Too many concurrent chats. Please wait for one to finish.",
        });
      } else {
        dispatch({ type: StreamActionType.SET_ERROR, chatId, error: err.message });
      }
    },
    onSettled: (_data, _error, variables) => {
      abortControllersRef.current.delete(variables.streamKey);
    },
  });

  const startStream = useCallback(
    (content: MessageContent, opts?: { chatId?: string; model?: string }) => {
      if (!opts?.chatId) {
        for (const key of Object.keys(streamsRef.current)) {
          if (
            key.startsWith(PENDING_CHAT_ID_PREFIX) &&
            !streamsRef.current[key]?.isStreaming
          ) {
            dispatch({ type: StreamActionType.REMOVE_STREAM, chatId: key });
          }
        }
      }
      const streamKey =
        opts?.chatId ??
        `${PENDING_CHAT_ID_PREFIX}${crypto.randomUUID().slice(0, 8)}`;
      mutation.mutate({
        content,
        chatId: opts?.chatId,
        model: opts?.model,
        streamKey,
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
      getStreamForChat,
    }),
    [startStream, cancelStream, resetStream, setActiveChatId, getStreamForChat],
  );

  return (
    <ChatStreamStateContext.Provider
      value={{ streams, activeChatId }}
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

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
  MessageContentPartType,
  openRunEventsStream,
  type MessageContent,
  type SendMessageRequest,
} from "@/lib/api";
import {
  INITIAL_STREAM_STATE,
  type StreamState,
  type MetaEvent,
  type ChatMessage,
  ChatRole,
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
const OPTIMISTIC_USER_MESSAGE_PREFIX = "optimistic_user_";

interface AbortControllerEntry {
  controller: AbortController;
  mutationId: string;
}

function extractUserTextFromContent(content: MessageContent): string {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : "[Image message]";
  }

  const text = content
    .filter((part) => part.type === MessageContentPartType.TEXT)
    .map((part) => part.text.trim())
    .filter((value) => value.length > 0)
    .join("\n")
    .trim();

  return text.length > 0 ? text : "[Image message]";
}

function buildOptimisticUserMessage(
  chatId: string,
  content: MessageContent,
  id: string,
): ChatMessage {
  const now = new Date().toISOString();
  return {
    id,
    chatId,
    role: ChatRole.USER,
    content: extractUserTextFromContent(content),
    userId: null,
    createdAt: now,
    updatedAt: now,
    completionTime: null,
    inputTokens: null,
    outputTokens: null,
  };
}

interface ChatStreamStateContextValue {
  streams: StreamMap;
  activeChatId: string | null;
}

interface ChatStreamActionsContextValue {
  startStream: (
    content: MessageContent,
    opts?: { chatId?: string; model?: string },
  ) => void;
  resumeRunStream: (chatId: string, runId: string) => void;
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
  const abortControllersRef = useRef<Map<string, AbortControllerEntry>>(new Map());
  const latestMutationByChatRef = useRef<Map<string, string>>(new Map());
  const mutationChatKeyRef = useRef<Map<string, string>>(new Map());
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

  const isLatestMutationForChat = useCallback(
    (chatId: string, mutationId: string): boolean =>
      latestMutationByChatRef.current.get(chatId) === mutationId,
    [],
  );

  const cancelStream = useCallback((chatId: string) => {
    const entry = abortControllersRef.current.get(chatId);
    if (entry) {
      entry.controller.abort();
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

  const resumeRunStream = useCallback(
    (chatId: string, runId: string) => {
      if (!chatId || !runId) {
        return;
      }

      if (streamsRef.current[chatId]?.isStreaming) {
        return;
      }

      const existing = abortControllersRef.current.get(chatId);
      if (existing) {
        return;
      }

      const mutationId = `resume_${crypto.randomUUID()}`;
      latestMutationByChatRef.current.set(chatId, mutationId);
      mutationChatKeyRef.current.set(mutationId, chatId);

      const controller = new AbortController();
      abortControllersRef.current.set(chatId, {
        controller,
        mutationId,
      });

      dispatch({ type: StreamActionType.START_STREAMING, chatId });

      const thinkingRef = { current: null as number | null };

      void (async () => {
        try {
          const response = await openRunEventsStream(chatId, runId, {
            signal: controller.signal,
          });

          let resolvedChatId = chatId;

          const streamResult = await processStreamResponse({
            response,
            chatId,
            dispatch,
            onMetaRef,
            thinkingStartRef: thinkingRef,
            onChatIdResolved: (realChatId: string) => {
              if (realChatId === resolvedChatId) {
                return;
              }

              dispatch({
                type: StreamActionType.RENAME_STREAM,
                oldChatId: resolvedChatId,
                newChatId: realChatId,
              });

              const controllerEntry =
                abortControllersRef.current.get(resolvedChatId);
              if (controllerEntry?.mutationId === mutationId) {
                abortControllersRef.current.delete(resolvedChatId);
                abortControllersRef.current.set(realChatId, controllerEntry);
              }

              if (isLatestMutationForChat(resolvedChatId, mutationId)) {
                latestMutationByChatRef.current.delete(resolvedChatId);
                latestMutationByChatRef.current.set(realChatId, mutationId);
              }

              mutationChatKeyRef.current.set(mutationId, realChatId);
              resolvedChatId = realChatId;
            },
          });

          if (isLatestMutationForChat(resolvedChatId, mutationId)) {
            dispatch({
              type: StreamActionType.STOP_STREAMING,
              chatId: resolvedChatId,
            });

            void queryClient.invalidateQueries({
              queryKey: queryKeys.chatHistory.byChatId(resolvedChatId),
            });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.recentChats.all,
            });

            if (streamResult) {
              dispatch({
                type: StreamActionType.REMOVE_STREAM,
                chatId: resolvedChatId,
              });
            }
          }
        } catch (error) {
          const err = error as Error;
          const trackedChatId =
            mutationChatKeyRef.current.get(mutationId) ?? chatId;

          if (!isLatestMutationForChat(trackedChatId, mutationId)) {
            return;
          }

          dispatch({
            type: StreamActionType.STOP_STREAMING,
            chatId: trackedChatId,
          });

          if (err.name !== ABORT_ERROR_NAME) {
            dispatch({
              type: StreamActionType.SET_ERROR,
              chatId: trackedChatId,
              error: err.message || "Failed to reconnect to active run stream.",
            });
          }
        } finally {
          const trackedChatId = mutationChatKeyRef.current.get(mutationId) ?? chatId;
          for (const key of new Set([chatId, trackedChatId])) {
            const entry = abortControllersRef.current.get(key);
            if (entry?.mutationId === mutationId) {
              abortControllersRef.current.delete(key);
            }
            if (isLatestMutationForChat(key, mutationId)) {
              latestMutationByChatRef.current.delete(key);
            }
          }
          mutationChatKeyRef.current.delete(mutationId);
        }
      })();
    },
    [isLatestMutationForChat, queryClient],
  );

  const mutation = useMutation({
    mutationFn: async ({
      content,
      chatId,
      model,
      streamKey,
      mutationId,
      controller,
      optimisticUserMessageId,
    }: {
      content: MessageContent;
      chatId?: string;
      model?: string;
      streamKey: string;
      mutationId: string;
      controller: AbortController;
      optimisticUserMessageId?: string;
    }) => {
      const existingEntry = abortControllersRef.current.get(streamKey);
      if (
        !existingEntry ||
        existingEntry.mutationId !== mutationId ||
        existingEntry.controller !== controller
      ) {
        abortControllersRef.current.set(streamKey, {
          controller,
          mutationId,
        });
      }
      mutationChatKeyRef.current.set(mutationId, streamKey);

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
          if (realChatId === resolvedChatId) {
            return;
          }

          dispatch({
            type: StreamActionType.RENAME_STREAM,
            oldChatId: resolvedChatId,
            newChatId: realChatId,
          });

          const controllerEntry =
            abortControllersRef.current.get(resolvedChatId);
          if (controllerEntry?.mutationId === mutationId) {
            abortControllersRef.current.delete(resolvedChatId);
            abortControllersRef.current.set(realChatId, controllerEntry);
          }

          if (isLatestMutationForChat(resolvedChatId, mutationId)) {
            latestMutationByChatRef.current.delete(resolvedChatId);
            latestMutationByChatRef.current.set(realChatId, mutationId);
          }

          mutationChatKeyRef.current.set(mutationId, realChatId);
          resolvedChatId = realChatId;
        },
      });

      const metaEvt = streamResult?.meta;

      if (isLatestMutationForChat(resolvedChatId, mutationId)) {
        dispatch({ type: StreamActionType.STOP_STREAMING, chatId: resolvedChatId });
      }

      if (metaEvt?.chatId && streamResult) {
        if (metaEvt.userMessageId) {
          queryClient.setQueryData<ChatMessage[]>(
            queryKeys.chatHistory.byChatId(metaEvt.chatId),
            (oldMessages = []) => {
              const withoutOptimistic = optimisticUserMessageId
                ? oldMessages.filter((msg) => msg.id !== optimisticUserMessageId)
                : oldMessages;
              const hasRealUserMessage = withoutOptimistic.some(
                (msg) => msg.id === metaEvt.userMessageId,
              );
              if (hasRealUserMessage) {
                return withoutOptimistic;
              }
              return [
                ...withoutOptimistic,
                buildOptimisticUserMessage(
                  metaEvt.chatId,
                  content,
                  metaEvt.userMessageId,
                ),
              ];
            },
          );
        }

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

        if (isLatestMutationForChat(metaEvt.chatId, mutationId)) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.chatHistory.byChatId(metaEvt.chatId),
          });
        }
        void queryClient.invalidateQueries({ queryKey: queryKeys.recentChats.all });

        if (isLatestMutationForChat(resolvedChatId, mutationId)) {
          dispatch({ type: StreamActionType.REMOVE_STREAM, chatId: resolvedChatId });
        }
      } else if (
        streamResult &&
        isLatestMutationForChat(resolvedChatId, mutationId)
      ) {
        dispatch({ type: StreamActionType.REMOVE_STREAM, chatId: resolvedChatId });
      }

      return metaEvt;
    },
    onError: (err: Error, variables) => {
      const trackedChatId =
        mutationChatKeyRef.current.get(variables.mutationId) ??
        variables.streamKey;
      if (!isLatestMutationForChat(trackedChatId, variables.mutationId)) {
        return;
      }

      if (variables.optimisticUserMessageId) {
        queryClient.setQueryData<ChatMessage[]>(
          queryKeys.chatHistory.byChatId(trackedChatId),
          (oldMessages = []) =>
            oldMessages.filter(
              (msg) => msg.id !== variables.optimisticUserMessageId,
            ),
        );
      }

      if (err.name === ABORT_ERROR_NAME) {
        dispatch({ type: StreamActionType.STOP_STREAMING, chatId: trackedChatId });
        return;
      }
      dispatch({ type: StreamActionType.STOP_STREAMING, chatId: trackedChatId });
      const apiError = err as Error & { status?: number };
      if (apiError.status === 429) {
        dispatch({
          type: StreamActionType.SET_ERROR,
          chatId: trackedChatId,
          error:
            apiError.message ||
            "Too many concurrent requests. Please wait and retry.",
        });
      } else {
        dispatch({
          type: StreamActionType.SET_ERROR,
          chatId: trackedChatId,
          error: err.message,
        });
      }
    },
    onSettled: (_data, _error, variables) => {
      const trackedChatId =
        mutationChatKeyRef.current.get(variables.mutationId) ??
        variables.streamKey;
      for (const key of new Set([variables.streamKey, trackedChatId])) {
        const entry = abortControllersRef.current.get(key);
        if (entry?.mutationId === variables.mutationId) {
          abortControllersRef.current.delete(key);
        }
        if (isLatestMutationForChat(key, variables.mutationId)) {
          latestMutationByChatRef.current.delete(key);
        }
      }
      mutationChatKeyRef.current.delete(variables.mutationId);
    },
  });

  const startStream = useCallback(
    (
      content: MessageContent,
      opts?: { chatId?: string; model?: string },
    ) => {
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
      const mutationId = crypto.randomUUID();
      const controller = new AbortController();
      const existingEntry = abortControllersRef.current.get(streamKey);
      if (existingEntry) {
        existingEntry.controller.abort();
        abortControllersRef.current.delete(streamKey);
      }

      latestMutationByChatRef.current.set(streamKey, mutationId);
      abortControllersRef.current.set(streamKey, {
        controller,
        mutationId,
      });
      dispatch({ type: StreamActionType.START_STREAMING, chatId: streamKey });

      let optimisticUserMessageId: string | undefined;
      if (opts?.chatId) {
        const targetChatId = opts.chatId;
        const optimisticId = `${OPTIMISTIC_USER_MESSAGE_PREFIX}${mutationId}`;
        optimisticUserMessageId = optimisticId;
        queryClient.setQueryData<ChatMessage[]>(
          queryKeys.chatHistory.byChatId(targetChatId),
          (oldMessages = []) => {
            if (oldMessages.some((msg) => msg.id === optimisticId)) {
              return oldMessages;
            }
            return [
              ...oldMessages,
              buildOptimisticUserMessage(
                targetChatId,
                content,
                optimisticId,
              ),
            ];
          },
        );
      }

      mutation.mutate({
        content,
        chatId: opts?.chatId,
        model: opts?.model,
        streamKey,
        mutationId,
        controller,
        optimisticUserMessageId,
      });
    },
    [mutation, queryClient],
  );

  const actions = useMemo(
    () => ({
      startStream,
      resumeRunStream,
      cancelStream,
      resetStream,
      setActiveChatId,
      onMetaRef,
      getStreamForChat,
    }),
    [
      startStream,
      resumeRunStream,
      cancelStream,
      resetStream,
      setActiveChatId,
      getStreamForChat,
    ],
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

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useReducer,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postChatMessageStream,
  MessageContentPartType,
  openRunEventsStream,
  cancelRun,
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
import { processStreamResponse, type RefCell } from "./chatStream.processor";
import { queryKeys } from "@/lib/queryKeys";
import { normalizeUserMessageText } from "@/lib/userMessageText";

const ABORT_ERROR_NAME = "AbortError";
const PENDING_CHAT_ID_PREFIX = "pending_";
const OPTIMISTIC_USER_MESSAGE_PREFIX = "optimistic_user_";

interface AbortControllerEntry {
  controller: AbortController;
  mutationId: string;
}

function extractUserTextFromContent(content: MessageContent): string {
  if (typeof content === "string") {
    const normalized = normalizeUserMessageText(content);
    return normalized.length > 0 ? normalized : "[Image message]";
  }

  const text = content
    .filter((part) => part.type === MessageContentPartType.TEXT)
    .map((part) => normalizeUserMessageText(part.text))
    .filter((value) => value.length > 0)
    .join("\n");
  const normalized = normalizeUserMessageText(text);

  return normalized.length > 0 ? normalized : "[Image message]";
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

export interface ChatStreamStateContextValue {
  streams: StreamMap;
  activeChatId: string | null;
}

interface StartStreamOptions {
  chatId?: string;
  model?: string;
  suppressOptimisticUserMessage?: boolean;
  retryTargetAssistantMessageId?: string;
}

export interface ChatStreamActionsContextValue {
  startStream: (
    content: MessageContent,
    opts?: StartStreamOptions,
  ) => void;
  resumeRunStream: (chatId: string, runId: string) => void;
  cancelStream: (chatId: string) => void;
  resetStream: (chatId: string) => void;
  setActiveChatId: (id: string | null) => void;
  onMetaRef: RefCell<((meta: MetaEvent) => void) | null>;
  getStreamForChat: (chatId: string | undefined) => StreamState;
}

interface UseChatStreamControllerResult {
  stateValue: ChatStreamStateContextValue;
  actionsValue: ChatStreamActionsContextValue;
}

const INITIAL_STREAMS: StreamMap = {};

export function useChatStreamController(): UseChatStreamControllerResult {
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
  const streamCursorRef = useRef<Map<string, string>>(new Map());

  const persistCursor = useCallback((chatId: string, runId: string, lastEventId: string): void => {
    const key = `${chatId}:${runId}`;
    streamCursorRef.current.set(key, lastEventId);
    try {
      sessionStorage.setItem(`sse_cursor:${key}`, lastEventId);
    } catch {
      // sessionStorage may be unavailable in certain private-browsing environments.
    }
  }, []);

  const readCursor = useCallback((chatId: string, runId: string): string | undefined => {
    const key = `${chatId}:${runId}`;
    const inMemory = streamCursorRef.current.get(key);
    if (inMemory) return inMemory;
    try {
      return sessionStorage.getItem(`sse_cursor:${key}`) ?? undefined;
    } catch {
      return undefined;
    }
  }, []);

  const clearCursor = useCallback((chatId: string, runId: string): void => {
    const key = `${chatId}:${runId}`;
    streamCursorRef.current.delete(key);
    try {
      sessionStorage.removeItem(`sse_cursor:${key}`);
    } catch {
      // no-op
    }
  }, []);

  useEffect(
    () => () => {
      for (const entry of abortControllersRef.current.values()) {
        entry.controller.abort();
      }
      abortControllersRef.current.clear();
      latestMutationByChatRef.current.clear();
      mutationChatKeyRef.current.clear();
    },
    [],
  );

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
    const streamState = streamsRef.current[chatId];
    const runId = streamState?.meta?.runId;
    const realChatId = streamState?.meta?.chatId ?? chatId;
    if (runId && realChatId) {
      void cancelRun(realChatId, runId);
    }
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
          const resumeCursor = readCursor(chatId, runId);
          const response = await openRunEventsStream(chatId, runId, {
            signal: controller.signal,
            ...(resumeCursor ? { lastEventId: resumeCursor } : {}),
          });

          let resolvedChatId = chatId;

          const streamResult = await processStreamResponse({
            response,
            chatId,
            dispatch,
            onMetaRef,
            thinkingStartRef: thinkingRef,
            onCursorUpdate: (id: string, rId: string) => persistCursor(resolvedChatId, rId, id),
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
              clearCursor(resolvedChatId, runId);
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
              error: {
                message:
                  err.message || "Failed to reconnect to active run stream.",
                code: "resume_attach_failed",
              },
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
    [isLatestMutationForChat, queryClient, readCursor, persistCursor, clearCursor],
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
      retryInsertIndex,
    }: {
      content: MessageContent;
      chatId?: string;
      model?: string;
      streamKey: string;
      mutationId: string;
      controller: AbortController;
      optimisticUserMessageId?: string;
      retryInsertIndex?: number;
      removedAssistantSnapshot?: { message: ChatMessage; index: number };
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
        onCursorUpdate: (id: string, rId: string) => persistCursor(resolvedChatId, rId, id),
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
              if (retryInsertIndex !== undefined) {
                const next = [...oldMessages];
                next.splice(retryInsertIndex, 0, optimisticMessage);
                return next;
              }
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
          if (metaEvt.runId) {
            clearCursor(resolvedChatId, metaEvt.runId);
          }
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

      if (variables.removedAssistantSnapshot) {
        const { message: removedMsg, index: removedIndex } =
          variables.removedAssistantSnapshot;
        queryClient.setQueryData<ChatMessage[]>(
          queryKeys.chatHistory.byChatId(trackedChatId),
          (oldMessages = []) => {
            const next = [...oldMessages];
            next.splice(removedIndex, 0, removedMsg);
            return next;
          },
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
          error: {
            message:
              apiError.message ||
              "Too many concurrent requests. Please wait and retry.",
            code: "too_many_requests",
          },
        });
      } else {
        dispatch({
          type: StreamActionType.SET_ERROR,
          chatId: trackedChatId,
          error: {
            message: err.message,
            code: "request_failed",
          },
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
      opts?: StartStreamOptions,
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
      let retryInsertIndex: number | undefined;
      let removedAssistantSnapshot:
        | { message: ChatMessage; index: number }
        | undefined;

      if (opts?.chatId) {
        const targetChatId = opts.chatId;

        if (opts.retryTargetAssistantMessageId) {
          const chatHistory =
            queryClient.getQueryData<ChatMessage[]>(
              queryKeys.chatHistory.byChatId(targetChatId),
            ) ?? [];
          const targetIndex = chatHistory.findIndex(
            (m) => m.id === opts.retryTargetAssistantMessageId,
          );
          if (targetIndex !== -1) {
            removedAssistantSnapshot = {
              message: chatHistory[targetIndex]!,
              index: targetIndex,
            };
            retryInsertIndex = targetIndex;
            queryClient.setQueryData<ChatMessage[]>(
              queryKeys.chatHistory.byChatId(targetChatId),
              (old = []) =>
                old.filter(
                  (m) => m.id !== opts.retryTargetAssistantMessageId,
                ),
            );
          }
        }

        if (!opts.suppressOptimisticUserMessage) {
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
      }

      mutation.mutate({
        content,
        chatId: opts?.chatId,
        model: opts?.model,
        streamKey,
        mutationId,
        controller,
        optimisticUserMessageId,
        retryInsertIndex,
        removedAssistantSnapshot,
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

  return {
    stateValue: { streams, activeChatId },
    actionsValue: actions,
  };
}

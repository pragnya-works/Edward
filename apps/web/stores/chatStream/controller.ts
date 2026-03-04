"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MetaEvent } from "@edward/shared/streamEvents";
import type { MessageContent } from "@/lib/api/messageContent";
import { cancelRun, getActiveRun } from "@/lib/api/chat";
import type { StreamAction } from "@edward/shared/chat/streamActions";
import {
  getChatStreamState,
  useChatStreamStore,
} from "@/stores/chatStream/store";
import {
  createStreamCursorPersistence,
  type StreamCursorPersistence,
} from "@/stores/chatStream/cursorPersistence";
import {
  type AbortControllerEntry,
} from "@/stores/chatStream/mutationTracking";
import {
  createResumeRunStream,
} from "@/stores/chatStream/resumeRunStream";
import {
  useStartStream,
} from "@/stores/chatStream/useStartStream";
import { queryKeys } from "@/lib/queryKeys";
import type { StartStreamOptions } from "@/stores/chatStream/startStreamShared";
import {
  StreamActionType,
} from "@edward/shared/chat/streamActions";
import {
  clearRunStopIntent,
  markRunStopNotice,
  markRunStopIntent,
} from "@/lib/chat/runStopIntent";

const PENDING_CHAT_ID_PREFIX = "pending_";

function reportCancelStreamError(
  context: string,
  chatId: string,
  error: unknown,
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  console.error(`[chatStreamController:${chatId}] ${context}`, error);
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
  registerOnMeta: (id: string, fn: (meta: MetaEvent) => void) => void;
  unregisterOnMeta: (id: string) => void;
}

export function useChatStreamController(): ChatStreamActionsContextValue {
  const streams = useChatStreamStore((state) => state.streams);
  const setActiveChatId = useChatStreamStore((state) => state.setActiveChatId);
  const dispatchStreamAction = useChatStreamStore(
    (state) => state.dispatchStreamAction,
  );
  const queryClient = useQueryClient();

  const abortControllersRef = useRef<Map<string, AbortControllerEntry>>(new Map());
  const latestMutationByChatRef = useRef<Map<string, string>>(new Map());
  const mutationChatKeyRef = useRef<Map<string, string>>(new Map());
  const onMetaHandlersRef = useRef<Map<string, (meta: MetaEvent) => void>>(new Map());
  const onMetaRef = useRef<((meta: MetaEvent) => void) | null>(
    (meta: MetaEvent) => {
      for (const handler of onMetaHandlersRef.current.values()) {
        try {
          handler(meta);
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[chatStreamController] onMeta handler failed", error);
          }
        }
      }
    },
  );
  const streamsRef = useRef(getChatStreamState().streams);

  const cursorPersistence: StreamCursorPersistence = useMemo(
    () => createStreamCursorPersistence(),
    [],
  );

  useEffect(() => {
    streamsRef.current = streams;
  }, [streams]);

  const dispatch = useCallback(
    (action: StreamAction) => {
      dispatchStreamAction(action);
    },
    [dispatchStreamAction],
  );

  useEffect(
    () => () => {
      for (const entry of abortControllersRef.current.values()) {
        entry.controller.abort();
      }
      abortControllersRef.current.clear();
      latestMutationByChatRef.current.clear();
      mutationChatKeyRef.current.clear();
      onMetaHandlersRef.current.clear();
    },
    [],
  );

  const resetStream = useCallback(
    (chatId: string) => {
      dispatch({ type: StreamActionType.REMOVE_STREAM, chatId });
    },
    [dispatch],
  );

  const isLatestMutationForChat = useCallback(
    (chatId: string, mutationId: string): boolean =>
      latestMutationByChatRef.current.get(chatId) === mutationId,
    [],
  );

  const cancelStream = useCallback(
    (chatId: string) => {
      const streamState = streamsRef.current[chatId];
      const runId = streamState?.meta?.runId;
      const realChatId = streamState?.meta?.chatId ?? chatId;
      const cancelChatId =
        typeof realChatId === "string" &&
          realChatId.length > 0 &&
          !realChatId.startsWith(PENDING_CHAT_ID_PREFIX)
          ? realChatId
          : null;

      const entry = abortControllersRef.current.get(chatId);
      if (entry) {
        entry.controller.abort();
        abortControllersRef.current.delete(chatId);
      }

      dispatch({ type: StreamActionType.STOP_STREAMING, chatId });

      if (!cancelChatId) {
        return;
      }

      markRunStopIntent(cancelChatId);
      markRunStopNotice(cancelChatId, streamState?.meta?.userMessageId);

      void (async () => {
        try {
          if (runId) {
            try {
              await cancelRun(cancelChatId, runId);
            } catch (error) {
              // Fall through to active-run lookup if direct cancel misses.
              reportCancelStreamError(
                "direct cancelRun failed; falling back to active-run lookup",
                cancelChatId,
                error,
              );
            }
          }

          try {
            const activeRunResponse = await getActiveRun(cancelChatId);
            const activeRun = activeRunResponse.data.run;
            if (!activeRun) {
              clearRunStopIntent(cancelChatId);
              return;
            }

            if (!runId || activeRun.id !== runId) {
              try {
                await cancelRun(cancelChatId, activeRun.id);
              } catch (error) {
                // Keep stop intent active for later verification/retry.
                reportCancelStreamError(
                  "fallback cancelRun failed",
                  cancelChatId,
                  error,
                );
              }
            }
          } catch (error) {
            // Keep stop intent active if lookup fails.
            reportCancelStreamError(
              "getActiveRun lookup failed during cancel",
              cancelChatId,
              error,
            );
          }

          try {
            const afterCancel = await getActiveRun(cancelChatId);
            if (!afterCancel.data.run) {
              clearRunStopIntent(cancelChatId);
            }
          } catch (error) {
            // Keep stop intent active if verification fails.
            reportCancelStreamError(
              "post-cancel active-run verification failed",
              cancelChatId,
              error,
            );
          }
        } finally {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.activeRun.byChatId(cancelChatId),
            exact: true,
          });
        }
      })();
    },
    [dispatch, queryClient],
  );

  const registerOnMeta = useCallback(
    (id: string, fn: (meta: MetaEvent) => void) => {
      onMetaHandlersRef.current.set(id, fn);
    },
    [],
  );

  const unregisterOnMeta = useCallback(
    (id: string) => {
      onMetaHandlersRef.current.delete(id);
    },
    [],
  );

  const resumeRunStream = useMemo(
    () =>
      createResumeRunStream({
        dispatch,
        queryClient,
        onMetaRef,
        streamsRef,
        abortControllersRef,
        latestMutationByChatRef,
        mutationChatKeyRef,
        isLatestMutationForChat,
        readCursor: cursorPersistence.readCursor,
        persistCursor: cursorPersistence.persistCursor,
        clearCursor: cursorPersistence.clearCursor,
      }),
    [
      cursorPersistence.clearCursor,
      cursorPersistence.persistCursor,
      cursorPersistence.readCursor,
      dispatch,
      isLatestMutationForChat,
      queryClient,
    ],
  );

  const startStream = useStartStream({
    dispatch,
    onMetaRef,
    streamsRef,
    abortControllersRef,
    latestMutationByChatRef,
    mutationChatKeyRef,
    isLatestMutationForChat,
    persistCursor: cursorPersistence.persistCursor,
    clearCursor: cursorPersistence.clearCursor,
  });

  const actions = useMemo(
    () => ({
      startStream,
      resumeRunStream,
      cancelStream,
      resetStream,
      setActiveChatId,
      registerOnMeta,
      unregisterOnMeta,
    }),
    [
      startStream,
      resumeRunStream,
      cancelStream,
      resetStream,
      setActiveChatId,
      registerOnMeta,
      unregisterOnMeta,
    ],
  );

  return actions;
}

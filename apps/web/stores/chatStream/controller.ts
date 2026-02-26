"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MetaEvent } from "@edward/shared/streamEvents";
import {
  INITIAL_STREAM_STATE,
  type StreamState,
} from "@edward/shared/chat/types";
import type { MessageContent } from "@/lib/api/messageContent";
import { cancelRun } from "@/lib/api/chat";
import type { StreamAction } from "@edward/shared/chat/streamActions";
import type { StreamMap } from "@/stores/chatStream/reducer";
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
  type RefCell,
} from "@/lib/streaming/processors/chatStreamProcessor";

export interface ChatStreamStateContextValue {
  streams: StreamMap;
  activeChatId: string | null;
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

export function useChatStreamController(): UseChatStreamControllerResult {
  const streams = useChatStreamStore((state) => state.streams);
  const activeChatId = useChatStreamStore((state) => state.activeChatId);
  const setActiveChatId = useChatStreamStore((state) => state.setActiveChatId);
  const dispatchStreamAction = useChatStreamStore(
    (state) => state.dispatchStreamAction,
  );
  const queryClient = useQueryClient();
  const cancelRunMutation = useMutation({
    mutationFn: ({ chatId, runId }: { chatId: string; runId: string }) =>
      cancelRun(chatId, runId),
  });

  const abortControllersRef = useRef<Map<string, AbortControllerEntry>>(new Map());
  const latestMutationByChatRef = useRef<Map<string, string>>(new Map());
  const mutationChatKeyRef = useRef<Map<string, string>>(new Map());
  const onMetaRef = useRef<((meta: MetaEvent) => void) | null>(null);
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

      if (runId && realChatId) {
        void cancelRunMutation.mutateAsync({ chatId: realChatId, runId });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.activeRun.byChatId(realChatId),
        });
      }

      const entry = abortControllersRef.current.get(chatId);
      if (entry) {
        entry.controller.abort();
        abortControllersRef.current.delete(chatId);
      }

      dispatch({ type: StreamActionType.STOP_STREAMING, chatId });
    },
    [cancelRunMutation, dispatch, queryClient],
  );

  const getStreamForChat = useCallback(
    (chatId: string | undefined): StreamState => {
      if (!chatId) {
        return INITIAL_STREAM_STATE;
      }
      return streamsRef.current[chatId] ?? INITIAL_STREAM_STATE;
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

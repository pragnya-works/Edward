"use client";

import {
  useCallback,
  type RefObject,
} from "react";
import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  MetaEvent,
  StreamState,
} from "@edward/shared/chat/types";
import {
  StreamActionType,
  type StreamAction,
} from "@edward/shared/chat/streamActions";
import type {
  MessageContent,
} from "@/lib/api/messageContent";
import type {
  RefCell,
} from "@/lib/streaming/processors/chatStreamProcessor";
import type {
  AbortControllerEntry,
} from "@/stores/chatStream/mutationTracking";
import {
  cleanupPendingStreams,
  prepareStartStreamMutation,
} from "@/stores/chatStream/startStreamPreparation";
import {
  executeStartStreamMutation,
} from "@/stores/chatStream/startStreamMutationHandlers";
import {
  handleStartStreamError,
  handleStartStreamSettled,
} from "@/stores/chatStream/startStreamErrorHandlers";
import {
  PENDING_CHAT_ID_PREFIX,
  type StartStreamMutationDeps,
  type StartStreamMutationVariables,
  type StartStreamOptions,
} from "@/stores/chatStream/startStreamShared";

interface UseStartStreamParams {
  dispatch: (action: StreamAction) => void;
  onMetaRef: RefCell<((meta: MetaEvent) => void) | null>;
  streamsRef: RefObject<Record<string, StreamState>>;
  abortControllersRef: RefObject<Map<string, AbortControllerEntry>>;
  latestMutationByChatRef: RefObject<Map<string, string>>;
  mutationChatKeyRef: RefObject<Map<string, string>>;
  isLatestMutationForChat: (chatId: string, mutationId: string) => boolean;
  persistCursor: (chatId: string, runId: string, lastEventId: string) => void;
  clearCursor: (chatId: string, runId: string) => void;
}

export type { StartStreamOptions };

export function useStartStream({
  dispatch,
  onMetaRef,
  streamsRef,
  abortControllersRef,
  latestMutationByChatRef,
  mutationChatKeyRef,
  isLatestMutationForChat,
  persistCursor,
  clearCursor,
}: UseStartStreamParams): (content: MessageContent, opts?: StartStreamOptions) => void {
  const queryClient = useQueryClient();

  const mutationContext: StartStreamMutationDeps = {
    dispatch,
    onMetaRef,
    queryClient,
    streamsRef,
    abortControllersRef,
    latestMutationByChatRef,
    mutationChatKeyRef,
    isLatestMutationForChat,
    persistCursor,
    clearCursor,
  };

  const mutation = useMutation({
    mutationFn: async (variables: StartStreamMutationVariables) =>
      executeStartStreamMutation(variables, mutationContext),
    onError: (error: Error, variables: StartStreamMutationVariables) =>
      handleStartStreamError(error, variables, mutationContext),
    onSettled: (_data, _error, variables: StartStreamMutationVariables) =>
      handleStartStreamSettled(variables, mutationContext),
  });

  return useCallback(
    (content: MessageContent, opts?: StartStreamOptions) => {
      if (!opts?.chatId) {
        cleanupPendingStreams({
          dispatch,
          streams: streamsRef.current,
        });
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

      const preparedState = prepareStartStreamMutation({
        queryClient,
        content,
        options: opts,
        mutationId,
      });

      mutation.mutate({
        content,
        chatId: opts?.chatId,
        model: opts?.model,
        streamKey,
        mutationId,
        controller,
        optimisticUserMessageId: preparedState.optimisticUserMessageId,
        retryInsertIndex: preparedState.retryInsertIndex,
        removedAssistantSnapshot: preparedState.removedAssistantSnapshot,
      });
    },
    [
      abortControllersRef,
      dispatch,
      latestMutationByChatRef,
      mutation,
      queryClient,
      streamsRef,
    ],
  );
}

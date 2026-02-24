"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";
import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { MetaEvent } from "@edward/shared/streamEvents";
import type {
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
  acquireChatSubmissionLock,
  releaseChatSubmissionLock,
  startChatSubmissionLockHeartbeat,
} from "@/lib/chat/submissionLock";
import { getRateLimitCooldown } from "@/lib/rateLimit/state";
import { RATE_LIMIT_SCOPE } from "@/lib/rateLimit/scopes";
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
  const lockHeartbeatStopByMutationIdRef = useRef(new Map<string, () => void>());
  const lockTokenByMutationIdRef = useRef(new Map<string, string>());
  const isUnmountedRef = useRef(false);

  const mutation = useMutation({
    mutationFn: async (variables: StartStreamMutationVariables) =>
      executeStartStreamMutation(variables, mutationContext),
    onError: (error: Error, variables: StartStreamMutationVariables) =>
      handleStartStreamError(error, variables, mutationContext),
    onSettled: (_data, _error, variables: StartStreamMutationVariables) => {
      const stopHeartbeat = lockHeartbeatStopByMutationIdRef.current.get(
        variables.mutationId,
      );
      if (stopHeartbeat) {
        stopHeartbeat();
        lockHeartbeatStopByMutationIdRef.current.delete(variables.mutationId);
      }
      lockTokenByMutationIdRef.current.delete(variables.mutationId);

      handleStartStreamSettled(variables, mutationContext);
    },
  });

  useEffect(
    () => {
      isUnmountedRef.current = false;
      const heartbeatStopByMutationId = lockHeartbeatStopByMutationIdRef.current;
      const lockTokenByMutationId = lockTokenByMutationIdRef.current;

      return () => {
        isUnmountedRef.current = true;

        for (const stopHeartbeat of heartbeatStopByMutationId.values()) {
          stopHeartbeat();
        }
        heartbeatStopByMutationId.clear();

        for (const token of lockTokenByMutationId.values()) {
          releaseChatSubmissionLock(token);
        }
        lockTokenByMutationId.clear();
      };
    },
    [],
  );

  return useCallback(
    (content: MessageContent, opts?: StartStreamOptions) => {
      if (isUnmountedRef.current) {
        return;
      }

      const now = Date.now();
      if (
        getRateLimitCooldown(RATE_LIMIT_SCOPE.CHAT_DAILY, now) ||
        getRateLimitCooldown(RATE_LIMIT_SCOPE.CHAT_BURST, now)
      ) {
        return;
      }

      void (async () => {
        const submissionLockToken = await acquireChatSubmissionLock().catch(
          () => null,
        );
        if (!submissionLockToken) {
          return;
        }

        if (isUnmountedRef.current) {
          releaseChatSubmissionLock(submissionLockToken);
          return;
        }

        const stopLockHeartbeat = startChatSubmissionLockHeartbeat(
          submissionLockToken,
        );

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
        lockHeartbeatStopByMutationIdRef.current.set(
          mutationId,
          stopLockHeartbeat,
        );
        lockTokenByMutationIdRef.current.set(mutationId, submissionLockToken);

        try {
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
            retryTargetUserMessageId: opts?.retryTargetUserMessageId,
            retryTargetAssistantMessageId: opts?.retryTargetAssistantMessageId,
            submissionLockToken,
            streamKey,
            mutationId,
            controller,
            optimisticUserMessageId: preparedState.optimisticUserMessageId,
            retryInsertIndex: preparedState.retryInsertIndex,
            removedAssistantSnapshot: preparedState.removedAssistantSnapshot,
          });
        } catch {
          lockTokenByMutationIdRef.current.delete(mutationId);
          lockHeartbeatStopByMutationIdRef.current.delete(mutationId);
          stopLockHeartbeat();
          releaseChatSubmissionLock(submissionLockToken);
          dispatch({ type: StreamActionType.STOP_STREAMING, chatId: streamKey });
        }
      })();
    },
    [
      abortControllersRef,
      dispatch,
      latestMutationByChatRef,
      lockHeartbeatStopByMutationIdRef,
      lockTokenByMutationIdRef,
      mutation,
      queryClient,
      isUnmountedRef,
      streamsRef,
    ],
  );
}

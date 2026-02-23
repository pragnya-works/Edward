import type { RefObject } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { MetaEvent, StreamState } from "@edward/shared/chat/types";
import { StreamActionType, type StreamAction } from "@edward/shared/chat/streamActions";
import { openRunEventsStream } from "@/lib/api/chat";
import { queryKeys } from "@/lib/queryKeys";
import {
  processStreamResponse,
  type RefCell,
} from "@/lib/streaming/processors/chatStreamProcessor";
import {
  cleanupMutationTracking,
  rebindMutationToChat,
  type AbortControllerEntry,
} from "@/stores/chatStream/mutationTracking";

interface CreateResumeRunStreamParams {
  dispatch: (action: StreamAction) => void;
  queryClient: QueryClient;
  onMetaRef: RefCell<((meta: MetaEvent) => void) | null>;
  streamsRef: RefObject<Record<string, StreamState>>;
  abortControllersRef: RefObject<Map<string, AbortControllerEntry>>;
  latestMutationByChatRef: RefObject<Map<string, string>>;
  mutationChatKeyRef: RefObject<Map<string, string>>;
  isLatestMutationForChat: (chatId: string, mutationId: string) => boolean;
  readCursor: (chatId: string, runId: string) => string | undefined;
  persistCursor: (chatId: string, runId: string, lastEventId: string) => void;
  clearCursor: (chatId: string, runId: string) => void;
}

const ABORT_ERROR_NAME = "AbortError";

export function createResumeRunStream({
  dispatch,
  queryClient,
  onMetaRef,
  streamsRef,
  abortControllersRef,
  latestMutationByChatRef,
  mutationChatKeyRef,
  isLatestMutationForChat,
  readCursor,
  persistCursor,
  clearCursor,
}: CreateResumeRunStreamParams): (chatId: string, runId: string) => void {
  return (chatId: string, runId: string) => {
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
          onCursorUpdate: (id: string, rId: string) =>
            persistCursor(resolvedChatId, rId, id),
          onChatIdResolved: (realChatId: string) => {
            if (realChatId === resolvedChatId) {
              return;
            }

            dispatch({
              type: StreamActionType.RENAME_STREAM,
              oldChatId: resolvedChatId,
              newChatId: realChatId,
            });

            rebindMutationToChat({
              previousChatId: resolvedChatId,
              nextChatId: realChatId,
              mutationId,
              abortControllersRef,
              latestMutationByChatRef,
              mutationChatKeyRef,
            });

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
        const trackedChatId =
          mutationChatKeyRef.current.get(mutationId) ?? chatId;

        cleanupMutationTracking({
          primaryChatId: chatId,
          fallbackChatId: trackedChatId,
          mutationId,
          abortControllersRef,
          latestMutationByChatRef,
          mutationChatKeyRef,
          isLatestMutationForChat,
        });
      }
    })();
  };
}

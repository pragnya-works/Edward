import type {
  QueryClient,
} from "@tanstack/react-query";
import type {
  ChatMessage,
} from "@edward/shared/chat/types";
import {
  StreamActionType,
} from "@edward/shared/chat/streamActions";
import {
  queryKeys,
} from "@/lib/queryKeys";
import {
  cleanupMutationTracking,
} from "@/stores/chatStream/mutationTracking";
import {
  ABORT_ERROR_NAME,
  type RemovedAssistantSnapshot,
  type StartStreamMutationDeps,
  type StartStreamMutationVariables,
} from "@/stores/chatStream/startStreamShared";

interface ApiError extends Error {
  status?: number;
}

function rollbackOptimisticUserMessage(
  queryClient: QueryClient,
  chatId: string,
  optimisticUserMessageId: string,
): void {
  queryClient.setQueryData<ChatMessage[]>(
    queryKeys.chatHistory.byChatId(chatId),
    (oldMessages = []) =>
      oldMessages.filter((msg) => msg.id !== optimisticUserMessageId),
  );
}

function restoreRemovedAssistantSnapshot(
  queryClient: QueryClient,
  chatId: string,
  removedAssistantSnapshot: RemovedAssistantSnapshot,
): void {
  queryClient.setQueryData<ChatMessage[]>(
    queryKeys.chatHistory.byChatId(chatId),
    (oldMessages = []) => {
      const next = [...oldMessages];
      next.splice(
        removedAssistantSnapshot.index,
        0,
        removedAssistantSnapshot.message,
      );
      return next;
    },
  );
}

export function handleStartStreamError(
  error: Error,
  variables: StartStreamMutationVariables,
  deps: StartStreamMutationDeps,
): void {
  const trackedChatId =
    deps.mutationChatKeyRef.current.get(variables.mutationId) ??
    variables.streamKey;
  if (!deps.isLatestMutationForChat(trackedChatId, variables.mutationId)) {
    return;
  }

  if (variables.optimisticUserMessageId) {
    rollbackOptimisticUserMessage(
      deps.queryClient,
      trackedChatId,
      variables.optimisticUserMessageId,
    );
  }

  if (variables.removedAssistantSnapshot) {
    restoreRemovedAssistantSnapshot(
      deps.queryClient,
      trackedChatId,
      variables.removedAssistantSnapshot,
    );
  }

  if (error.name === ABORT_ERROR_NAME) {
    deps.dispatch({
      type: StreamActionType.STOP_STREAMING,
      chatId: trackedChatId,
    });
    return;
  }

  deps.dispatch({
    type: StreamActionType.STOP_STREAMING,
    chatId: trackedChatId,
  });

  const apiError = error as ApiError;
  if (apiError.status === 429) {
    deps.dispatch({
      type: StreamActionType.SET_ERROR,
      chatId: trackedChatId,
      error: {
        message:
          apiError.message ||
          "Too many concurrent requests. Please wait and retry.",
        code: "too_many_requests",
      },
    });
    return;
  }

  deps.dispatch({
    type: StreamActionType.SET_ERROR,
    chatId: trackedChatId,
    error: {
      message: error.message,
      code: "request_failed",
    },
  });
}

export function handleStartStreamSettled(
  variables: StartStreamMutationVariables,
  deps: StartStreamMutationDeps,
): void {
  const trackedChatId =
    deps.mutationChatKeyRef.current.get(variables.mutationId) ??
    variables.streamKey;

  cleanupMutationTracking({
    primaryChatId: variables.streamKey,
    fallbackChatId: trackedChatId,
    mutationId: variables.mutationId,
    abortControllersRef: deps.abortControllersRef,
    latestMutationByChatRef: deps.latestMutationByChatRef,
    mutationChatKeyRef: deps.mutationChatKeyRef,
    isLatestMutationForChat: deps.isLatestMutationForChat,
  });
}

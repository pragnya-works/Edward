import type {
  QueryClient,
} from "@tanstack/react-query";
import type {
  ChatMessage,
  StreamState,
} from "@edward/shared/chat/types";
import {
  StreamActionType,
  type StreamAction,
} from "@edward/shared/chat/streamActions";
import type {
  MessageContent,
} from "@/lib/api/messageContent";
import {
  queryKeys,
} from "@/lib/queryKeys";
import {
  buildOptimisticUserMessage,
} from "@/stores/chatStream/streamMessageUtils";
import {
  OPTIMISTIC_USER_MESSAGE_PREFIX,
  PENDING_CHAT_ID_PREFIX,
  type RemovedAssistantSnapshot,
  type StartStreamOptions,
  type StartStreamPreparedState,
} from "@/stores/chatStream/startStreamShared";

interface PrepareStartStreamMutationParams {
  queryClient: QueryClient;
  content: MessageContent;
  options?: StartStreamOptions;
  mutationId: string;
}

interface CleanupPendingStreamsParams {
  dispatch: (action: StreamAction) => void;
  streams: Record<string, StreamState>;
}

export function cleanupPendingStreams({
  dispatch,
  streams,
}: CleanupPendingStreamsParams): void {
  for (const key of Object.keys(streams)) {
    if (key.startsWith(PENDING_CHAT_ID_PREFIX) && !streams[key]?.isStreaming) {
      dispatch({ type: StreamActionType.REMOVE_STREAM, chatId: key });
    }
  }
}

function removeAssistantForRetry(
  queryClient: QueryClient,
  chatId: string,
  targetAssistantMessageId: string,
): {
  retryInsertIndex?: number;
  removedAssistantSnapshot?: RemovedAssistantSnapshot;
} {
  const chatHistory =
    queryClient.getQueryData<ChatMessage[]>(
      queryKeys.chatHistory.byChatId(chatId),
    ) ?? [];
  const targetIndex = chatHistory.findIndex(
    (message) => message.id === targetAssistantMessageId,
  );

  if (targetIndex === -1) {
    return {};
  }

  const removedAssistantSnapshot: RemovedAssistantSnapshot = {
    message: chatHistory[targetIndex]!,
    index: targetIndex,
  };

  queryClient.setQueryData<ChatMessage[]>(
    queryKeys.chatHistory.byChatId(chatId),
    (old = []) =>
      old.filter((message) => message.id !== targetAssistantMessageId),
  );

  return {
    retryInsertIndex: targetIndex,
    removedAssistantSnapshot,
  };
}

function setOptimisticUserMessage(
  queryClient: QueryClient,
  chatId: string,
  content: MessageContent,
  mutationId: string,
): string {
  const optimisticId = `${OPTIMISTIC_USER_MESSAGE_PREFIX}${mutationId}`;
  queryClient.setQueryData<ChatMessage[]>(
    queryKeys.chatHistory.byChatId(chatId),
    (oldMessages = []) => {
      if (oldMessages.some((message) => message.id === optimisticId)) {
        return oldMessages;
      }

      return [
        ...oldMessages,
        buildOptimisticUserMessage(chatId, content, optimisticId),
      ];
    },
  );

  return optimisticId;
}

export function prepareStartStreamMutation({
  queryClient,
  content,
  options,
  mutationId,
}: PrepareStartStreamMutationParams): StartStreamPreparedState {
  if (!options?.chatId) {
    return {};
  }

  const preparedState: StartStreamPreparedState = {};
  const targetChatId = options.chatId;

  if (options.retryTargetAssistantMessageId) {
    const retryState = removeAssistantForRetry(
      queryClient,
      targetChatId,
      options.retryTargetAssistantMessageId,
    );
    preparedState.retryInsertIndex = retryState.retryInsertIndex;
    preparedState.removedAssistantSnapshot = retryState.removedAssistantSnapshot;
  }

  if (!options.suppressOptimisticUserMessage) {
    preparedState.optimisticUserMessageId = setOptimisticUserMessage(
      queryClient,
      targetChatId,
      content,
      mutationId,
    );
  }

  return preparedState;
}

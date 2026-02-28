import type {
  QueryClient,
} from "@tanstack/react-query";
import {
  INITIAL_STREAM_STATE,
  type ChatMessage,
  type StreamState,
} from "@edward/shared/chat/types";
import {
  StreamActionType,
} from "@edward/shared/chat/streamActions";
import {
  postChatMessageStream,
  type SendMessageRequest,
} from "@/lib/api/chat";
import {
  queryKeys,
} from "@/lib/queryKeys";
import {
  buildMessageFromStream,
} from "@/lib/parsing/streamToMessage";
import {
  processStreamResponse,
} from "@/lib/streaming/processors/chatStreamProcessor";
import {
  rebindMutationToChat,
} from "@/stores/chatStream/mutationTracking";
import {
  buildOptimisticUserMessage,
} from "@/stores/chatStream/streamMessageUtils";
import {
  type StartStreamMutationDeps,
  type StartStreamMutationVariables,
} from "@/stores/chatStream/startStreamShared";

interface SetUserMessageParams {
  queryClient: QueryClient;
  chatId: string;
  content: StartStreamMutationVariables["content"];
  userMessageId: string;
  optimisticUserMessageId?: string;
}

interface InsertAssistantMessageParams {
  queryClient: QueryClient;
  chatId: string;
  streamState: StreamState;
  retryInsertIndex?: number;
}

function setResolvedUserMessage({
  queryClient,
  chatId,
  content,
  userMessageId,
  optimisticUserMessageId,
}: SetUserMessageParams): void {
  queryClient.setQueryData<ChatMessage[]>(
    queryKeys.chatHistory.byChatId(chatId),
    (oldMessages = []) => {
      const withoutOptimistic = optimisticUserMessageId
        ? oldMessages.filter((msg) => msg.id !== optimisticUserMessageId)
        : oldMessages;
      const hasRealUserMessage = withoutOptimistic.some(
        (msg) => msg.id === userMessageId,
      );

      if (hasRealUserMessage) {
        return withoutOptimistic;
      }

      return [
        ...withoutOptimistic,
        buildOptimisticUserMessage(chatId, content, userMessageId),
      ];
    },
  );
}

function insertAssistantMessage({
  queryClient,
  chatId,
  streamState,
  retryInsertIndex,
}: InsertAssistantMessageParams): void {
  if (!streamState.meta) {
    return;
  }

  const optimisticMessage = buildMessageFromStream(streamState, streamState.meta);
  if (!optimisticMessage) {
    return;
  }

  queryClient.setQueryData<ChatMessage[]>(
    queryKeys.chatHistory.byChatId(chatId),
    (oldMessages = []) => {
      const exists = oldMessages.some((msg) => msg.id === optimisticMessage.id);
      if (exists) {
        return oldMessages;
      }

      if (retryInsertIndex !== undefined) {
        const next = [...oldMessages];
        next.splice(retryInsertIndex, 0, optimisticMessage);
        return next;
      }

      return [...oldMessages, optimisticMessage];
    },
  );
}

export async function executeStartStreamMutation(
  variables: StartStreamMutationVariables,
  deps: StartStreamMutationDeps,
) {
  const existingEntry = deps.abortControllersRef.current.get(variables.streamKey);
  if (
    !existingEntry ||
    existingEntry.mutationId !== variables.mutationId ||
    existingEntry.controller !== variables.controller
  ) {
    deps.abortControllersRef.current.set(variables.streamKey, {
      controller: variables.controller,
      mutationId: variables.mutationId,
    });
  }
  deps.mutationChatKeyRef.current.set(variables.mutationId, variables.streamKey);

  const thinkingRef = { current: null as number | null };
  const body: SendMessageRequest = {
    content: variables.content,
    chatId: variables.chatId,
    model: variables.model,
    retryTargetUserMessageId: variables.retryTargetUserMessageId,
    retryTargetAssistantMessageId: variables.retryTargetAssistantMessageId,
  };
  const response = await postChatMessageStream(body, variables.controller.signal);

  let resolvedChatId = variables.streamKey;
  let recentChatsRefreshedOnChatResolve = false;

  const streamResult = await processStreamResponse({
    response,
    chatId: variables.streamKey,
    dispatch: deps.dispatch,
    onMetaRef: deps.onMetaRef,
    thinkingStartRef: thinkingRef,
    onCursorUpdate: (id: string, runId: string) =>
      deps.persistCursor(resolvedChatId, runId, id),
    onChatIdResolved: (realChatId: string) => {
      if (realChatId === resolvedChatId) {
        return;
      }

      deps.dispatch({
        type: StreamActionType.RENAME_STREAM,
        oldChatId: resolvedChatId,
        newChatId: realChatId,
      });

      rebindMutationToChat({
        previousChatId: resolvedChatId,
        nextChatId: realChatId,
        mutationId: variables.mutationId,
        abortControllersRef: deps.abortControllersRef,
        latestMutationByChatRef: deps.latestMutationByChatRef,
        mutationChatKeyRef: deps.mutationChatKeyRef,
      });

      resolvedChatId = realChatId;

      if (!recentChatsRefreshedOnChatResolve) {
        recentChatsRefreshedOnChatResolve = true;
        void deps.queryClient.invalidateQueries({
          queryKey: queryKeys.recentChats.all,
        });
      }
    },
  });

  const metaEvent = streamResult?.meta;
  const hasFatalStreamError = Boolean(streamResult?.fatalError);

  if (deps.isLatestMutationForChat(resolvedChatId, variables.mutationId)) {
    deps.dispatch({
      type: StreamActionType.STOP_STREAMING,
      chatId: resolvedChatId,
    });
  }

  if (metaEvent?.chatId && streamResult) {
    if (metaEvent.userMessageId) {
      setResolvedUserMessage({
        queryClient: deps.queryClient,
        chatId: metaEvent.chatId,
        content: variables.content,
        userMessageId: metaEvent.userMessageId,
        optimisticUserMessageId: variables.optimisticUserMessageId,
      });
    }

    if (!hasFatalStreamError) {
      const augmentedStreamState: StreamState = {
        ...INITIAL_STREAM_STATE,
        streamingText: streamResult.text,
        textOrder: streamResult.textOrder,
        thinkingText: streamResult.thinking,
        completedFiles: streamResult.completedFiles,
        installingDeps: streamResult.installingDeps,
        installOrder: streamResult.installOrder,
        command: streamResult.command,
        projectOrder: streamResult.projectOrder,
        webSearches: streamResult.webSearches,
        metrics: streamResult.metrics,
        previewUrl: streamResult.previewUrl,
        meta: metaEvent,
      };

      insertAssistantMessage({
        queryClient: deps.queryClient,
        chatId: metaEvent.chatId,
        streamState: augmentedStreamState,
        retryInsertIndex: variables.retryInsertIndex,
      });
    }

    if (deps.isLatestMutationForChat(metaEvent.chatId, variables.mutationId)) {
      void deps.queryClient.invalidateQueries({
        queryKey: queryKeys.chatHistory.byChatId(metaEvent.chatId),
      });
      void deps.queryClient.invalidateQueries({
        queryKey: queryKeys.activeRun.byChatId(metaEvent.chatId),
      });
    }
    if (!recentChatsRefreshedOnChatResolve) {
      void deps.queryClient.invalidateQueries({
        queryKey: queryKeys.recentChats.all,
      });
    }

    if (deps.isLatestMutationForChat(resolvedChatId, variables.mutationId)) {
      if (metaEvent.runId) {
        deps.clearCursor(resolvedChatId, metaEvent.runId);
      }
      if (!hasFatalStreamError) {
        deps.dispatch({
          type: StreamActionType.REMOVE_STREAM,
          chatId: resolvedChatId,
        });
      }
    }
  } else if (
    streamResult &&
    !hasFatalStreamError &&
    deps.isLatestMutationForChat(resolvedChatId, variables.mutationId)
  ) {
    deps.dispatch({
      type: StreamActionType.REMOVE_STREAM,
      chatId: resolvedChatId,
    });
  }

  return metaEvent;
}

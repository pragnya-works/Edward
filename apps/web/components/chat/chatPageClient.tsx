"use client";

import { useEffect, useMemo } from "react";
import { useChatHistory } from "@/hooks/server-state/useChatHistory";
import { useChatStream, useChatStreamActions } from "@/contexts/chatStreamContext";
import { useSandbox } from "@/contexts/sandboxContext";
import { ChatWorkspace } from "@/components/chat/chatWorkspace";
import { ChatErrorState, ChatLoadingState } from "@/components/chat/chatPageStates";
import { useChatPageOrchestration } from "@/hooks/chat/useChatPageOrchestration";
import { ChatRole, INITIAL_STREAM_STATE } from "@edward/shared/chat/types";
import {
  clearRunStopNotice,
  getRunStopNotice,
  hasRunStopNotice,
} from "@/lib/chat/runStopIntent";

interface ChatPageClientProps {
  chatId: string;
}

const AGGRESSIVE_ACTIVE_RUN_LOOKUP_WINDOW_MS = 90_000;

export default function ChatPageClient({ chatId }: ChatPageClientProps) {
  const {
    messages,
    isLoading: isHistoryLoading,
    error: historyError,
  } = useChatHistory(chatId);

  const { streams } = useChatStream();
  const { setActiveChatId, resumeRunStream } = useChatStreamActions();
  const { isOpen: sandboxOpen, openSandbox, setRouteChatId } = useSandbox();

  const stream =
    streams[chatId] ??
    Object.values(streams).find(
      (candidate) =>
        candidate.streamChatId === chatId || candidate.meta?.chatId === chatId,
    ) ??
    INITIAL_STREAM_STATE;

  const hasActiveStreamState =
    stream.isStreaming ||
    stream.isThinking ||
    stream.streamingText.length > 0 ||
    stream.thinkingText.length > 0 ||
    stream.activeFiles.length > 0 ||
    stream.completedFiles.length > 0 ||
    stream.isSandboxing ||
    stream.installingDeps.length > 0;

  const latestMessage = messages[messages.length - 1];
  const stopNotice = getRunStopNotice(chatId);
  const shouldShowStopNotice =
    Boolean(stopNotice) &&
    latestMessage?.role === ChatRole.USER &&
    (!stopNotice?.userMessageId || stopNotice.userMessageId === latestMessage.id);
  const messagesWithStopNotice = useMemo(() => {
    if (!shouldShowStopNotice) {
      return messages;
    }

    const userMessage = latestMessage;
    if (!userMessage || userMessage.role !== ChatRole.USER) {
      return messages;
    }

    const syntheticMessageId = `local-stop-notice:${chatId}:${userMessage.id}`;
    if (messages.some((message) => message.id === syntheticMessageId)) {
      return messages;
    }

    const noticeTimestamp = userMessage.updatedAt || userMessage.createdAt;
    return [
      ...messages,
      {
        id: syntheticMessageId,
        chatId,
        role: ChatRole.ASSISTANT,
        content:
          "Generation stopped at your request. Send another message when you want me to continue.",
        userId: null,
        createdAt: noticeTimestamp,
        updatedAt: noticeTimestamp,
        completionTime: null,
        inputTokens: null,
        outputTokens: null,
      },
    ];
  }, [chatId, latestMessage, messages, shouldShowStopNotice]);
  const latestMessageTime = latestMessage?.createdAt
    ? Date.parse(latestMessage.createdAt)
    : Number.NaN;
  const shouldUseAggressiveLookup =
    latestMessage?.role === ChatRole.USER &&
    Number.isFinite(latestMessageTime) &&
    Date.now() - latestMessageTime <= AGGRESSIVE_ACTIVE_RUN_LOOKUP_WINDOW_MS;
  const activeRunLookupMode =
    isHistoryLoading
      ? "defer"
      : historyError || shouldUseAggressiveLookup
        ? "aggressive"
        : "single";
  const hasResumeAttachError = stream.error?.code === "resume_attach_failed";

  useChatPageOrchestration({
    chatId,
    latestUserMessageId:
      latestMessage?.role === ChatRole.USER ? latestMessage.id : null,
    hasResumeAttachError,
    isSandboxing: stream.isSandboxing,
    hasActiveStreamState,
    activeRunLookupMode,
    sandboxOpen,
    openSandbox,
    setRouteChatId,
    setActiveChatId,
    resumeRunStream,
  });

  useEffect(() => {
    if (!chatId || !hasRunStopNotice(chatId)) {
      return;
    }

    if (latestMessage?.role === ChatRole.ASSISTANT) {
      clearRunStopNotice(chatId);
    }
  }, [chatId, latestMessage?.id, latestMessage?.role]);

  if (isHistoryLoading && !hasActiveStreamState) {
    return <ChatLoadingState />;
  }

  if (historyError && !hasActiveStreamState) {
    return (
      <ChatErrorState
        message={
          historyError.message ||
          "This conversation may not exist or you don't have access."
        }
      />
    );
  }

  return (
    <ChatWorkspace
      chatId={chatId}
      messages={messagesWithStopNotice}
      stream={stream}
    />
  );
}

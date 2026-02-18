"use client";

import { useChatHistory } from "@/hooks/useChatHistory";
import { useChatStream, useChatStreamActions } from "@/contexts/chatStreamContext";
import { useSandbox } from "@/contexts/sandboxContext";
import { ChatWorkspace } from "@/components/chat/chatWorkspace";
import { ChatErrorState, ChatLoadingState } from "@/components/chat/chatPageStates";
import { useChatPageOrchestration } from "@/hooks/useChatPageOrchestration";
import { INITIAL_STREAM_STATE } from "@/lib/chatTypes";

interface ChatPageClientProps {
  chatId: string;
}

export default function ChatPageClient({ chatId }: ChatPageClientProps) {
  const {
    messages,
    isLoading: isHistoryLoading,
    error: historyError,
  } = useChatHistory(chatId);

  const { streams } = useChatStream();
  const { setActiveChatId } = useChatStreamActions();
  const { isOpen: sandboxOpen, openSandbox } = useSandbox();

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

  useChatPageOrchestration({
    chatId,
    isSandboxing: stream.isSandboxing,
    sandboxOpen,
    openSandbox,
    setActiveChatId,
  });

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
      messages={messages}
      stream={stream}
      sandboxOpen={sandboxOpen}
    />
  );
}

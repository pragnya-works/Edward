"use client";

import { useParams } from "next/navigation";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useChatStream, useChatStreamActions } from "@/contexts/chatStreamContext";
import { useSandbox } from "@/contexts/sandboxContext";
import { ChatWorkspace } from "@/components/chat/chatWorkspace";
import { ChatErrorState, ChatLoadingState } from "@/components/chat/chatPageStates";
import { useChatPageOrchestration } from "@/hooks/useChatPageOrchestration";

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const chatId = params.id;

  const {
    messages,
    isLoading: isHistoryLoading,
    error: historyError,
  } = useChatHistory(chatId);

  const { stream } = useChatStream();
  const { setActiveChatId } = useChatStreamActions();
  const { isOpen: sandboxOpen, openSandbox } = useSandbox();

  useChatPageOrchestration({
    chatId,
    isSandboxing: stream.isSandboxing,
    sandboxOpen,
    openSandbox,
    setActiveChatId,
  });

  if (isHistoryLoading) {
    return <ChatLoadingState />;
  }

  if (historyError) {
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

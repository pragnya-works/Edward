"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { useChatHistory } from "@/hooks/useChatHistory";
import {
  useChatStream,
  useChatStreamActions,
} from "@/contexts/chatStreamContext";
import { ChatMessageList } from "@/components/chat/chatMessageList";
import AuthenticatedPromptbar from "@/components/authenticatedPromptbar";

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const chatId = params.id;

  const {
    messages,
    isLoading: isHistoryLoading,
    error: historyError,
  } = useChatHistory(chatId);

  const { stream } = useChatStream();
  const { setActiveChatId, onMetaRef } = useChatStreamActions();

  useEffect(() => {
    setActiveChatId(chatId);
    return () => setActiveChatId(null);
  }, [chatId, setActiveChatId]);

  useEffect(() => {
    onMetaRef.current = null;
  }, [onMetaRef]);

  if (isHistoryLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-3"
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground/40">
            Loading conversation...
          </p>
        </motion.div>
      </div>
    );
  }

  if (historyError) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-destructive text-lg">!</span>
          </div>
          <h2 className="text-sm font-medium text-foreground mb-1">
            Unable to load conversation
          </h2>
          <p className="text-xs text-muted-foreground/50">
            {historyError.message ||
              "This conversation may not exist or you don't have access."}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 w-full safe-area-insets">
      <ChatMessageList messages={messages} stream={stream} />

      <div className="flex-shrink-0 w-full max-w-4xl mx-auto px-3 sm:px-4 pb-[env(safe-area-inset-bottom,0.5rem)] sm:pb-6 pt-0">
        <AuthenticatedPromptbar chatId={chatId} />
      </div>
    </div>
  );
}

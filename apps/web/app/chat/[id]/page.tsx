"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, X } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useChatStream, useChatStreamActions } from "@/contexts/chatStreamContext";
import { ChatMessageList } from "@/components/chat/chatMessageList";
import AuthenticatedPromptbar from "@/components/authenticatedPromptbar";
import { useSandboxSync } from "@/hooks/useSandboxSync";
import { useSandbox } from "@/contexts/sandboxContext";
import { SandboxPanel } from "./_components/sandboxPanel";

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

  useEffect(() => {
    if (stream.isSandboxing && !sandboxOpen) {
      openSandbox();
    }
  }, [stream.isSandboxing, sandboxOpen, openSandbox]);

  useSandboxSync();

  useEffect(() => {
    setActiveChatId(chatId);
    return () => setActiveChatId(null);
  }, [chatId, setActiveChatId]);

  if (isHistoryLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 className="h-8 w-8 text-violet-500" />
          </motion.div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
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
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <motion.div
            className="h-16 w-16 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-red-500/10"
            initial={{ scale: 0.8, rotate: -5 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.1, type: "spring" }}
          >
            <X className="h-7 w-7 text-red-500" />
          </motion.div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">
            Unable to load conversation
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {historyError.message ||
              "This conversation may not exist or you don't have access."}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Group orientation="horizontal" className="h-full">
        <Panel
          defaultSize={60}
          minSize={30}
          className="flex flex-col h-full relative"
        >
          <div className="flex-1 min-h-0">
            <ChatMessageList messages={messages} stream={stream} />
          </div>
          <div className="shrink-0 w-full max-w-4xl mx-auto px-4 pb-6 pt-2">
            <AuthenticatedPromptbar chatId={chatId} />
          </div>
        </Panel>

        <AnimatePresence>
          {sandboxOpen && (
            <>
              <Separator className="w-1.5 bg-transparent hover:bg-primary/10 transition-colors cursor-ew-resize relative group">
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-border group-hover:bg-primary/40" />
              </Separator>
              <Panel
                key="sandbox-panel"
                defaultSize={40}
                minSize={30}
                className="h-full border-l border-border/40"
              >
                <div className="h-full w-full">
                  <SandboxPanel />
                </div>
              </Panel>
            </>
          )}
        </AnimatePresence>
      </Group>
    </div>
  );
}

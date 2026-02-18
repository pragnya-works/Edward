"use client";

import { m, AnimatePresence } from "motion/react";
import { ChatMessageList } from "@/components/chat/chatMessageList";
import AuthenticatedPromptbar from "@/components/authenticatedPromptbar";
import type { ChatMessage as ChatMessageType, StreamState } from "@/lib/chatTypes";
import { SandboxPanel } from "@/components/chat/sandboxPanel";

interface ChatWorkspaceProps {
  chatId: string;
  messages: ChatMessageType[];
  stream: StreamState;
  sandboxOpen: boolean;
}

export function ChatWorkspace({
  chatId,
  messages,
  stream,
  sandboxOpen,
}: ChatWorkspaceProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <m.div 
        layout
        className="flex-1 min-w-0 h-full relative flex flex-col"
        transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
      >
        <div className="flex-1 min-h-0">
          <ChatMessageList messages={messages} stream={stream} />
        </div>
        <div className="shrink-0 w-full max-w-4xl mx-auto px-4 pb-6 pt-2">
          <AuthenticatedPromptbar chatId={chatId} />
        </div>
      </m.div>

      <AnimatePresence mode="popLayout">
        {sandboxOpen && (
          <m.div
            key="sandbox-sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "min(800px, 45%)", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
            className="h-full border-l border-border/40 bg-workspace-bg overflow-hidden flex flex-col relative"
          >
            <div className="flex-1 min-h-0">
              <SandboxPanel />
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
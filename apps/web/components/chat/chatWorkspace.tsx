"use client";

import { AnimatePresence } from "motion/react";
import { Group, Panel, Separator } from "react-resizable-panels";
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
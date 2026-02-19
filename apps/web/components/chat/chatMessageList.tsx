"use client";

import { memo } from "react";
import { m, AnimatePresence } from "motion/react";
import { ArrowDown } from "lucide-react";
import { ChatMessage } from "./chatMessage";
import { StreamingMessage } from "./streamingMessage";
import { useScrollToBottom } from "@/hooks/useScrollToBottom";
import type {
  ChatMessage as ChatMessageType,
  StreamState,
} from "@/lib/chatTypes";
import { ChatRole } from "@/lib/chatTypes";

interface ChatMessageListProps {
  messages: ChatMessageType[];
  stream: StreamState;
}

const SUGGESTED_STARTS = [
  "Build a landing page",
  "Create a task manager",
  "How use Shadcn?",
];

const WELCOME_SCREEN = (
  <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden px-4">
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-lg aspect-square bg-gradient-to-tr from-sky-500/5 to-indigo-500/5 rounded-full blur-3xl -z-10 motion-safe:animate-pulse" />

    <m.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
      className="text-center relative px-2 sm:px-6 max-w-full"
    >
      <div className="relative h-12 w-12 sm:h-16 sm:w-16 mb-4 sm:mb-6 mx-auto group">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-xl sm:rounded-2xl blur-lg opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
        <div className="relative h-12 w-12 sm:h-16 sm:w-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center shadow-2xl shadow-sky-500/20">
          <div className="h-4 w-5 sm:h-6 sm:w-8 bg-white rounded-br-lg sm:rounded-br-xl rounded-tr-[2px] rounded-tl-lg sm:rounded-tl-xl rounded-bl-[2px]" />
        </div>
      </div>

      <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-1.5 sm:mb-2 tracking-tight">
        Meet Edward
      </h2>
      <p className="text-xs sm:text-sm text-muted-foreground/50 max-w-[260px] sm:max-w-[280px] leading-relaxed mx-auto">
        I&apos;m your personal AI web app architect. Let me help you build
        something extraordinary.
      </p>

      <div className="mt-6 sm:mt-8 flex flex-col items-center gap-2 sm:gap-3 w-full">
        <span className="text-[9px] sm:text-[10px] font-bold text-sky-400/40 uppercase tracking-widest">
          Suggested starts
        </span>
        <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 max-w-full">
          {SUGGESTED_STARTS.map((text, i) => (
            <m.span
              key={text}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-foreground/[0.03] border border-foreground/[0.05] text-[10px] sm:text-[11px] text-muted-foreground/60 transition-colors touch-manipulation whitespace-nowrap"
            >
              {text}
            </m.span>
          ))}
        </div>
      </div>
    </m.div>
  </div>
);

export const ChatMessageList = memo(function ChatMessageList({
  messages,
  stream,
}: ChatMessageListProps) {
  const { scrollRef, bottomRef, showScrollButton, scrollToBottom } =
    useScrollToBottom([
      messages.length,
      stream.streamingText,
      stream.thinkingText,
      stream.activeFiles.length,
      stream.isThinking,
      stream.isSandboxing,
    ]);

  const visibleMessages = messages.filter(
    (m) => m.role === ChatRole.USER || m.role === ChatRole.ASSISTANT,
  );

  const hasStreamActivity =
    stream.isStreaming ||
    stream.isThinking ||
    stream.streamingText.length > 0 ||
    stream.thinkingText.length > 0 ||
    stream.activeFiles.length > 0 ||
    stream.completedFiles.length > 0 ||
    stream.isSandboxing ||
    stream.installingDeps.length > 0 ||
    stream.webSearches.length > 0 ||
    stream.urlScrapes.length > 0 ||
    Boolean(stream.command) ||
    Boolean(stream.error);

  const isEmpty = visibleMessages.length === 0 && !hasStreamActivity;

  if (isEmpty) {
    return WELCOME_SCREEN;
  }

  return (
    <div className="flex-1 relative min-h-0 flex flex-col h-full">
      <div
        className="absolute inset-x-0 top-0 h-12 sm:h-16 z-20 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, hsl(var(--background)), transparent)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-16 sm:h-24 z-20 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, hsl(var(--background)) 10%, transparent)",
        }}
      />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scroll-smooth no-scrollbar relative z-10 overscroll-contain"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent, black 24px, black calc(100% - 48px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 24px, black calc(100% - 48px), transparent)",
        }}
      >
        <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 md:px-0 pt-8 sm:pt-12 pb-2 space-y-8 sm:space-y-12">
          <AnimatePresence mode="popLayout" initial={false}>
            {visibleMessages.map((message: ChatMessageType, index: number) => (
              <ChatMessage key={message.id} message={message} index={index} />
            ))}
          </AnimatePresence>

          {hasStreamActivity && (
            <StreamingMessage stream={stream} />
          )}

          <div ref={bottomRef} className="h-4 sm:h-8 w-full shrink-0" />
        </div>
      </div>
      <AnimatePresence mode="wait">
        {showScrollButton && (
          <m.button
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            onClick={() => scrollToBottom("smooth")}
            aria-label="Scroll to recent messages"
            className="absolute bottom-10 sm:bottom-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full bg-background/60 backdrop-blur-xl border border-foreground/[0.08] hover:bg-background/80 transition-all group touch-manipulation cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowDown className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-sky-500/70" />
            <span className="text-[9px] sm:text-[10px] font-bold text-foreground/40 uppercase tracking-[0.15em] leading-none">
              Recent
            </span>
          </m.button>
        )}
      </AnimatePresence>
    </div>
  );
});

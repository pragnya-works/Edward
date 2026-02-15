"use client";

import { memo, useMemo } from "react";
import { motion } from "motion/react";
import { User } from "lucide-react";
import { EdwardAvatar } from "./avatars";
import { MessageMetrics } from "./messageMetrics";
import { cn } from "@edward/ui/lib/utils";
import type { ChatMessage as ChatMessageType } from "@/lib/chatTypes";
import { ParserEventType } from "@/lib/chatTypes";

import { parseMessageContent } from "@/lib/messageParser";
import { ThinkingIndicator } from "./thinkingIndicator";
import { FileBlock } from "./fileBlock";
import { CommandBlock } from "./commandBlock";
import { InstallBlock } from "./installBlock";

import { MarkdownRenderer } from "./markdownRenderer";

interface ChatMessageProps {
  message: ChatMessageType;
  index: number;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const UserAvatar = memo(function UserAvatar() {
  return (
    <div className="h-7 w-7 rounded-lg bg-foreground/[0.08] flex items-center justify-center shrink-0">
      <User className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
});

export const ChatMessage = memo(function ChatMessage({
  message,
  index,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const time = useMemo(
    () => formatTime(message.createdAt),
    [message.createdAt],
  );
  const content = message.content || "";

  const displayContent = useMemo(() => {
    if (!isUser || !content.startsWith("[")) return content;
    try {
      const parsed = JSON.parse(content) as Array<{
        type: string;
        text?: string;
      }>;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((p) => p.type === "text" && p.text)
          .map((p) => p.text)
          .join("\n");
      }
    } catch {
      return content;
    }
    return content;
  }, [content, isUser]);

  const blocks = useMemo(() => {
    if (isUser) return null;
    return parseMessageContent(displayContent ?? "");
  }, [displayContent, isUser]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.4,
        ease: [0.23, 1, 0.32, 1],
        delay: Math.min(index * 0.02, 0.1),
      }}
      className={cn(
        "flex gap-4 items-start group transition-all duration-300",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <div className="shrink-0 pt-0.5">
        {isUser ? <UserAvatar /> : <EdwardAvatar />}
      </div>

      <div
        className={cn(
          "flex flex-col flex-1 min-w-0",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "relative transition-all duration-300 w-full",
            isUser
              ? "w-fit max-w-[92%] rounded-[24px] rounded-tr-[4px] px-5 py-3.5 bg-foreground/[0.04] hover:bg-foreground/[0.06] text-foreground border border-foreground/[0.03] ml-auto"
              : "bg-transparent text-foreground",
          )}
        >
          {isUser ? (
            <p className="text-[15px] leading-[1.8] tracking-tight whitespace-pre-wrap break-words font-medium">
              {displayContent}
            </p>
          ) : (
            <div className="flex flex-col gap-4 w-full">
              {blocks?.map((block, i) => {
                switch (block.type) {
                  case "thinking":
                    return (
                      <ThinkingIndicator
                        key={i}
                        text={block.content}
                        isActive={false}
                        isCodeMode={false}
                      />
                    );
                  case "file":
                    return (
                      <FileBlock
                        key={i}
                        file={{
                          path: block.path,
                          content: block.content,
                          isComplete: true,
                        }}
                        index={i}
                      />
                    );
                  case "command":
                    return (
                      <CommandBlock
                        key={i}
                        command={{
                          type: ParserEventType.COMMAND,
                          command: block.command,
                          args: block.args,
                        }}
                      />
                    );
                  case "install":
                    return (
                      <InstallBlock key={i} dependencies={block.dependencies} />
                    );
                  case "text":
                    return (
                      <div
                        key={i}
                        className="text-[15px] leading-[1.8] tracking-tight font-medium"
                      >
                        <MarkdownRenderer content={block.content} />
                      </div>
                    );
                  default:
                    return null;
                }
              })}
            </div>
          )}
        </div>

        <div
          className={cn(
            "flex items-baseline gap-2 mt-1 px-1",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          {!isUser && (
            <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest select-none leading-none">
              Edward
            </span>
          )}
          <span className="w-1 h-1 rounded-full bg-foreground/[0.05] self-center" />
          <span className="text-[10px] font-mono text-muted-foreground/40 select-none leading-none">
            {time}
          </span>
          {!isUser && (
            <div className="inline-flex translate-y-0.5">
              <MessageMetrics
                completionTime={message.completionTime}
                inputTokens={message.inputTokens}
                outputTokens={message.outputTokens}
              />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});

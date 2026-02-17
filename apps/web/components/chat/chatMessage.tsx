"use client";

import { memo, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { User } from "lucide-react";
import { EdwardAvatar } from "./avatars";
import { MessageMetrics } from "./messageMetrics";
import { cn } from "@edward/ui/lib/utils";
import { useSandbox } from "@/contexts/sandboxContext";
import { ProjectButton } from "./projectButton";
import type { ChatMessage as ChatMessageType } from "@/lib/chatTypes";
import {
  ChatRole,
  MessageAttachmentType,
  ParserEventType,
} from "@/lib/chatTypes";
import { MessageContentPartType } from "@/lib/api";

import { MessageBlockType, parseMessageContent } from "@/lib/messageParser";
import { ThinkingIndicator } from "./thinkingIndicator";
import { FileBlock } from "./fileBlock";
import { CommandBlock } from "./commandBlock";
import { InstallBlock } from "./installBlock";

import { MarkdownRenderer } from "./markdownRenderer";
import Image from "next/image";

interface ImageAttachmentGridProps {
  attachments: NonNullable<ChatMessageType["attachments"]>;
}

const ImageAttachmentGrid = memo(function ImageAttachmentGrid({
  attachments,
}: ImageAttachmentGridProps) {
  const imageAttachments = attachments.filter(
    (a) => a.type === MessageAttachmentType.IMAGE,
  );

  if (imageAttachments.length === 0) return null;

  return (
    <div
      className={cn(
        "grid gap-2 mb-2",
        imageAttachments.length === 1 && "grid-cols-1",
        imageAttachments.length === 2 && "grid-cols-2",
        imageAttachments.length >= 3 && "grid-cols-3",
      )}
    >
      {imageAttachments.map((attachment) => (
        <motion.div
          key={attachment.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative rounded-xl overflow-hidden bg-foreground/[0.03] border border-foreground/[0.05]"
        >
          <Image
            src={attachment.url}
            alt={attachment.name || "Uploaded image"}
            width={1200}
            height={800}
            sizes="(max-width: 640px) 85vw, (max-width: 1024px) 60vw, 420px"
            className="w-full h-auto max-h-48 object-cover"
            loading="lazy"
            decoding="async"
          />
        </motion.div>
      ))}
    </div>
  );
});

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
    <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg bg-foreground/[0.08] flex items-center justify-center shrink-0">
      <User className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
    </div>
  );
});

export const ChatMessage = memo(function ChatMessage({
  message,
  index,
}: ChatMessageProps) {
  const { setFiles, files: globalFiles } = useSandbox();

  const isUser = message.role === ChatRole.USER;
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
          .filter((p) => p.type === MessageContentPartType.TEXT && p.text)
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

  const sandboxBlock = useMemo(
    () => blocks?.find((b) => b.type === MessageBlockType.SANDBOX),
    [blocks],
  );
  const fileBlocks = useMemo(
    () => blocks?.filter((b) => b.type === MessageBlockType.FILE) || [],
    [blocks],
  );
  const hasFiles = fileBlocks.length > 0 || !!sandboxBlock;
  const showFooterButton = hasFiles && !sandboxBlock;

  const handleToggle = useCallback(() => {
    if (globalFiles.length === 0 && fileBlocks.length > 0) {
      setFiles(
        fileBlocks.map((f) => ({
          path: (f as { path: string }).path,
          content: (f as { content: string }).content,
          isComplete: true,
        })),
      );
    }
  }, [globalFiles.length, fileBlocks, setFiles]);

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
        "flex gap-2 sm:gap-4 items-start group transition-all duration-300 w-full",
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
              ? "w-fit max-w-[85%] sm:max-w-[92%] rounded-[20px] sm:rounded-[24px] rounded-tr-[4px] px-4 py-3 sm:px-5 sm:py-3.5 bg-foreground/[0.04] hover:bg-foreground/[0.06] text-foreground border border-foreground/[0.03] ml-auto"
              : "bg-transparent text-foreground",
          )}
        >
          {isUser ? (
            <div className="flex flex-col gap-2">
              {message.attachments && message.attachments.length > 0 && (
                <ImageAttachmentGrid attachments={message.attachments} />
              )}
              {displayContent && (
                <p className="text-[14px] sm:text-[15px] leading-[1.7] sm:leading-[1.8] tracking-tight whitespace-pre-wrap break-words font-medium">
                  {displayContent}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:gap-4 w-full">
              {blocks?.map((block, i) => {
                switch (block.type) {
                  case MessageBlockType.THINKING:
                    return (
                      <ThinkingIndicator
                        key={i}
                        text={block.content}
                        isActive={false}
                        isCodeMode={false}
                      />
                    );
                  case MessageBlockType.FILE:
                    if (block.isInternal) return null;
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
                  case MessageBlockType.COMMAND:
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
                  case MessageBlockType.INSTALL:
                    return (
                      <InstallBlock key={i} dependencies={block.dependencies} />
                    );
                  case MessageBlockType.SANDBOX:
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full"
                      >
                        <ProjectButton
                          isStreaming={false}
                          files={fileBlocks.map((f) => ({
                            path: (f as { path: string }).path,
                            content: (f as { content: string }).content,
                            isComplete: true,
                          }))}
                          activeFilePath={null}
                          projectName={block.project}
                          onBeforeToggle={handleToggle}
                        />
                      </motion.div>
                    );
                  case MessageBlockType.DONE:
                    return null;
                  case MessageBlockType.TEXT:
                    return (
                      <div
                        key={i}
                        className="text-[14px] sm:text-[15px] leading-[1.7] sm:leading-[1.8] tracking-tight font-medium"
                      >
                        <MarkdownRenderer content={block.content} />
                      </div>
                    );
                }
              })}

              <AnimatePresence>
                {showFooterButton && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-2"
                  >
                    <ProjectButton
                      isStreaming={false}
                      files={fileBlocks.map((f) => ({
                        path: (f as { path: string }).path,
                        content: (f as { content: string }).content,
                        isComplete: true,
                      }))}
                      activeFilePath={null}
                      projectName={undefined}
                      onBeforeToggle={handleToggle}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 sm:mt-2 px-1",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          {!isUser && (
            <span className="text-[9px] sm:text-[10px] font-bold text-foreground/40 uppercase tracking-widest select-none leading-none shrink-0">
              Edward
            </span>
          )}
          <span className="w-1 h-1 rounded-full bg-foreground/[0.05] shrink-0" />
          <span className="text-[9px] sm:text-[10px] font-mono text-muted-foreground/40 select-none leading-none shrink-0">
            {time}
          </span>
          {!isUser && (
            <MessageMetrics
              completionTime={message.completionTime}
              inputTokens={message.inputTokens}
              outputTokens={message.outputTokens}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
});

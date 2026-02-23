"use client";

import { useCallback, useMemo } from "react";
import { m } from "motion/react";
import { User } from "lucide-react";
import { EdwardAvatar } from "./avatars";
import { MessageMetrics } from "./streamMetrics";
import { cn } from "@edward/ui/lib/utils";
import { useSandbox } from "@/contexts/sandboxContext";
import type { ChatMessage as ChatMessageType } from "@edward/shared/chat/types";
import { ChatRole } from "@edward/shared/chat/types";
import { MessageContentPartType } from "@/lib/api/messageContent";
import {
  MessageBlockType,
  parseMessageContent,
  type MessageBlock,
} from "@/lib/parsing/messageParser";
import { parseAssistantErrorMessage } from "@/lib/errors/assistantError";
import { AssistantErrorCard } from "@/components/chat/blocks/assistantErrorCard";
import { ImageAttachmentGrid } from "@/components/chat/messages/imageAttachmentGrid";
import { MarkdownRenderer } from "@/components/chat/messages/markdownRenderer";
import { MessageBlockRenderer } from "@/components/chat/messages/messageBlockRenderer";
import {
  isImageOnlyPlaceholderText,
  normalizeUserMessageText,
} from "@/lib/userMessageText";

interface ChatMessageProps {
  message: ChatMessageType;
  index: number;
  onRetryAssistantMessage?: (assistantMessageId: string) => boolean;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function UserAvatar() {
  return (
    <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg bg-foreground/[0.08] flex items-center justify-center shrink-0">
      <User className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
    </div>
  );
}

export function ChatMessage({
  message,
  index,
  onRetryAssistantMessage,
}: ChatMessageProps) {
  const { setFiles, files: globalFiles } = useSandbox();

  const isUser = message.role === ChatRole.USER;
  const time = useMemo(
    () => formatTime(message.createdAt),
    [message.createdAt],
  );
  const content = message.content || "";

  const displayContent = useMemo(() => {
    if (!isUser) {
      return content;
    }

    let normalized = content;
    if (content.startsWith("[")) {
      try {
        const parsed = JSON.parse(content) as Array<{
          type: string;
          text?: string;
        }>;
        if (Array.isArray(parsed)) {
          normalized = parsed
            .filter((p) => p.type === MessageContentPartType.TEXT && p.text)
            .map((p) => p.text)
            .join("\n");
        }
      } catch {
        normalized = content;
      }
    }

    return normalizeUserMessageText(normalized);
  }, [content, isUser]);

  const shouldShowUserText = useMemo(() => {
    if (!isUser || !displayContent) {
      return false;
    }

    const hasAttachments = (message.attachments?.length ?? 0) > 0;
    if (hasAttachments && isImageOnlyPlaceholderText(displayContent)) {
      return false;
    }

    return true;
  }, [displayContent, isUser, message.attachments]);

  const assistantError = useMemo(() => {
    if (isUser) return null;
    return parseAssistantErrorMessage(displayContent);
  }, [displayContent, isUser]);

  const blocks = useMemo(() => {
    if (isUser || assistantError) return null;
    return parseMessageContent(displayContent ?? "");
  }, [assistantError, displayContent, isUser]);

  const sandboxBlock = useMemo(
    () => blocks?.find((b) => b.type === MessageBlockType.SANDBOX),
    [blocks],
  );
  const fileBlocks = useMemo(
    () =>
      blocks?.filter(
        (
          block,
        ): block is Extract<MessageBlock, { type: MessageBlockType.FILE }> =>
          block.type === MessageBlockType.FILE,
      ) ?? [],
    [blocks],
  );
  const hasFiles = fileBlocks.length > 0 || !!sandboxBlock;
  const showFooterButton = hasFiles && !sandboxBlock;

  const handleToggle = useCallback(() => {
    if (globalFiles.length === 0 && fileBlocks.length > 0) {
      setFiles(
        fileBlocks.map((fileBlock) => ({
          path: fileBlock.path,
          content: fileBlock.content,
          isComplete: true,
        })),
      );
    }
  }, [globalFiles.length, fileBlocks, setFiles]);

  const handleRetry = useCallback((): boolean => {
    if (!onRetryAssistantMessage || message.role !== ChatRole.ASSISTANT) {
      return false;
    }
    return onRetryAssistantMessage(message.id);
  }, [message.id, message.role, onRetryAssistantMessage]);

  return (
    <m.div
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
              {shouldShowUserText && (
                <MarkdownRenderer
                  content={displayContent}
                  className="text-[14px] sm:text-[15px] leading-[1.7] sm:leading-[1.8] tracking-tight font-medium [&_p]:mb-0"
                />
              )}
            </div>
          ) : assistantError ? (
            <AssistantErrorCard
              error={assistantError}
              onRetry={onRetryAssistantMessage ? handleRetry : undefined}
            />
          ) : (
            <MessageBlockRenderer
              blocks={blocks ?? []}
              fileBlocks={fileBlocks}
              showFooterButton={showFooterButton}
              onBeforeToggleWorkspace={handleToggle}
            />
          )}
        </div>

        <div
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 sm:mt-2 px-1",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          {isUser && (
            <span className="text-[9px] sm:text-[10px] font-bold text-foreground/40 uppercase tracking-widest select-none leading-none shrink-0">
              You
            </span>
          )}
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
    </m.div>
  );
}

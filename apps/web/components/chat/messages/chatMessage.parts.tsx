import type { ReactNode, RefObject } from "react";
import { Check, ChevronDown, Copy, User } from "lucide-react";
import { cn } from "@edward/ui/lib/utils";
import type { ChatMessage as ChatMessageType } from "@edward/shared/chat/types";
import { MessageMetrics } from "./streamMetrics";
import { ImageAttachmentGrid } from "@/components/chat/messages/imageAttachmentGrid";
import { MarkdownRenderer } from "@/components/chat/messages/markdownRenderer";

interface CopyMessageButtonProps {
  isCopied: boolean;
  canCopyMessage: boolean;
  onCopy: () => void;
}

interface UserMessageBodyProps {
  attachments: ChatMessageType["attachments"];
  shouldShowUserText: boolean;
  shouldClampUserMessage: boolean;
  canToggleUserMessage: boolean;
  isUserMessageExpanded: boolean;
  displayContent: string;
  userMessageContentRef: RefObject<HTMLDivElement | null>;
  onToggleExpanded: () => void;
  collapseMaxHeightPx: number;
}

interface MessageFooterProps {
  isUser: boolean;
  time: string;
  copyButton: ReactNode;
  completionTime: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export function UserAvatar() {
  return (
    <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg bg-foreground/[0.08] flex items-center justify-center shrink-0">
      <User className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
    </div>
  );
}

export function CopyMessageButton({
  isCopied,
  canCopyMessage,
  onCopy,
}: CopyMessageButtonProps) {
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={isCopied ? "Message copied" : "Copy message"}
      disabled={!canCopyMessage}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-transparent transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "opacity-75 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
        canCopyMessage
          ? "text-foreground/50 hover:bg-foreground/[0.07] hover:text-foreground active:scale-[0.96]"
          : "text-foreground/25 cursor-not-allowed",
      )}
    >
      {isCopied ? (
        <Check className="h-4 w-4 text-emerald-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}

export function UserMessageBody({
  attachments,
  shouldShowUserText,
  shouldClampUserMessage,
  canToggleUserMessage,
  isUserMessageExpanded,
  displayContent,
  userMessageContentRef,
  onToggleExpanded,
  collapseMaxHeightPx,
}: UserMessageBodyProps) {
  return (
    <div className="flex flex-col gap-2">
      {attachments && attachments.length > 0 ? (
        <ImageAttachmentGrid attachments={attachments} />
      ) : null}
      {shouldShowUserText ? (
        <>
          <div
            ref={userMessageContentRef}
            className={cn(shouldClampUserMessage && "overflow-hidden")}
            style={
              shouldClampUserMessage ? { maxHeight: collapseMaxHeightPx } : undefined
            }
          >
            <MarkdownRenderer
              content={displayContent}
              className="text-[14px] sm:text-[15px] leading-[1.7] sm:leading-[1.8] tracking-tight font-medium [&_p]:mb-0"
            />
          </div>

          {canToggleUserMessage ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="group/toggle mt-0.5 inline-flex items-center gap-1.5 self-start rounded text-[11px] font-medium text-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            >
              <span>{isUserMessageExpanded ? "Show less" : "Show more"}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  isUserMessageExpanded && "rotate-180",
                )}
              />
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function MessageFooter({
  isUser,
  time,
  copyButton,
  completionTime,
  inputTokens,
  outputTokens,
}: MessageFooterProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 sm:mt-2 px-1",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <span className="text-[9px] sm:text-[10px] font-bold text-foreground/40 uppercase tracking-widest select-none leading-none shrink-0">
        {isUser ? "You" : "Edward"}
      </span>
      <span className="w-1 h-1 rounded-full bg-foreground/[0.05] shrink-0" />
      <span className="text-[9px] sm:text-[10px] font-mono text-muted-foreground/40 select-none leading-none shrink-0">
        {time}
      </span>
      {isUser ? copyButton : null}
      {!isUser ? (
        <MessageMetrics
          completionTime={completionTime}
          inputTokens={inputTokens}
          outputTokens={outputTokens}
        />
      ) : null}
      {!isUser ? copyButton : null}
    </div>
  );
}

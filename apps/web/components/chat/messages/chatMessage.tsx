"use client";

import { useCallback } from "react";
import { m } from "motion/react";
import { EdwardAvatar } from "./avatars";
import {
  CopyMessageButton,
  MessageFooter,
  UserAvatar,
  UserMessageBody,
} from "./chatMessage.parts";
import {
  USER_MESSAGE_COLLAPSE_MAX_HEIGHT_PX,
  useMessageCopy,
  useParsedChatMessage,
  useUserMessageVisibility,
} from "./chatMessage.model";
import { useChatWorkspaceContext } from "@/components/chat/chatWorkspaceContext";
import { AssistantErrorCard } from "@/components/chat/blocks/assistantErrorCard";
import { MessageBlockRenderer } from "@/components/chat/messages/messageBlockRenderer";
import type { ChatMessage as ChatMessageType } from "@edward/shared/chat/types";
import { ChatRole } from "@edward/shared/chat/types";
import { cn } from "@edward/ui/lib/utils";

interface ChatMessageProps {
  message: ChatMessageType;
  index: number;
}

export function ChatMessage({
  message,
  index,
}: ChatMessageProps) {
  const { onRetryAssistantMessage, retryDisabled } = useChatWorkspaceContext();

  const isUser = message.role === ChatRole.USER;
  const {
    time,
    displayContent,
    shouldShowUserText,
    assistantError,
    blocks,
    fileBlocks,
    showFooterButton,
  } = useParsedChatMessage(message, isUser);
  const {
    userMessageContentRef,
    isUserMessageExpanded,
    setIsUserMessageExpanded,
    canToggleUserMessage,
    shouldClampUserMessage,
  } = useUserMessageVisibility({
    messageId: message.id,
    displayContent,
    isUser,
    shouldShowUserText,
  });
  const { isCopied, canCopyMessage, handleCopyMessage } = useMessageCopy({
    isUser,
    displayContent,
    shouldShowUserText,
    attachments: message.attachments,
    assistantError,
    blocks,
  });

  const handleRetry = useCallback((): boolean => {
    if (!onRetryAssistantMessage || message.role !== ChatRole.ASSISTANT) {
      return false;
    }
    return onRetryAssistantMessage(message.id);
  }, [message.id, message.role, onRetryAssistantMessage]);

  const copyButton = (
    <CopyMessageButton
      isCopied={isCopied}
      canCopyMessage={canCopyMessage}
      onCopy={handleCopyMessage}
    />
  );

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
            <UserMessageBody
              attachments={message.attachments}
              shouldShowUserText={shouldShowUserText}
              shouldClampUserMessage={shouldClampUserMessage}
              canToggleUserMessage={canToggleUserMessage}
              isUserMessageExpanded={isUserMessageExpanded}
              displayContent={displayContent}
              userMessageContentRef={userMessageContentRef}
              collapseMaxHeightPx={USER_MESSAGE_COLLAPSE_MAX_HEIGHT_PX}
              onToggleExpanded={() =>
                setIsUserMessageExpanded((prev) => !prev)
              }
            />
          ) : assistantError ? (
            <AssistantErrorCard
              error={assistantError}
              onRetry={handleRetry}
              isRetryDisabled={retryDisabled}
            />
          ) : (
            <MessageBlockRenderer
              blocks={blocks ?? []}
              fileBlocks={fileBlocks}
              showFooterButton={showFooterButton}
            />
          )}
        </div>

        <MessageFooter
          isUser={isUser}
          time={time}
          copyButton={copyButton}
          completionTime={message.completionTime}
          inputTokens={message.inputTokens}
          outputTokens={message.outputTokens}
        />
      </div>
    </m.div>
  );
}

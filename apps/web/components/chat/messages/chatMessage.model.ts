"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssistantErrorViewModel } from "@/lib/errors/assistantError";
import { parseAssistantErrorMessage } from "@/lib/errors/assistantError";
import { MessageContentPartType } from "@/lib/api/messageContent";
import {
  MessageBlockType,
  parseMessageContent,
  type MessageBlock,
} from "@/lib/parsing/messageParser";
import {
  isImageOnlyPlaceholderText,
  normalizeUserMessageText,
} from "@/lib/userMessageText";
import type { ChatMessage as ChatMessageType } from "@edward/shared/chat/types";
import { toast } from "@edward/ui/components/sonner";
import { copyTextToClipboard } from "@edward/ui/lib/clipboard";

export const USER_MESSAGE_COLLAPSE_MAX_HEIGHT_PX = 184;
const USER_MESSAGE_COPY_RESET_TIMEOUT_MS = 2_000;

function normalizeUserDisplayContent(content: string): string {
  let normalized = content;
  if (content.startsWith("[")) {
    try {
      const parsed = JSON.parse(content) as Array<{
        type: string;
        text?: string;
      }>;
      if (Array.isArray(parsed)) {
        normalized = parsed
          .filter((part) => part.type === MessageContentPartType.TEXT && part.text)
          .map((part) => part.text)
          .join("\n");
      }
    } catch {
      normalized = content;
    }
  }

  return normalizeUserMessageText(normalized);
}

function buildUserCopyContent(
  displayContent: string,
  shouldShowUserText: boolean,
  attachments: ChatMessageType["attachments"],
): string {
  const sections: string[] = [];
  const userText = shouldShowUserText ? displayContent.trim() : "";
  if (userText) {
    sections.push(userText);
  }

  const attachmentLines = (attachments ?? [])
    .map((attachment) => `${attachment.name}: ${attachment.url}`)
    .filter((line) => line.trim().length > 0);
  if (attachmentLines.length > 0) {
    sections.push(`Attachments:\n${attachmentLines.join("\n")}`);
  }

  return sections.join("\n\n").trim();
}

function buildAssistantErrorCopyContent(
  assistantError: AssistantErrorViewModel,
): string {
  const sections = [assistantError.title, assistantError.message];
  if (
    assistantError.rawMessage &&
    assistantError.rawMessage !== assistantError.message
  ) {
    sections.push(assistantError.rawMessage);
  }
  return sections.filter(Boolean).join("\n\n").trim();
}

export function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function buildAssistantCopyContent(
  displayContent: string,
  blocks: MessageBlock[] | null,
): string {
  if (!blocks || blocks.length === 0) {
    return displayContent.trim();
  }

  const sections: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case MessageBlockType.THINKING:
      case MessageBlockType.TEXT: {
        const text = block.content.trim();
        if (text) {
          sections.push(text);
        }
        break;
      }
      case MessageBlockType.FILE: {
        if (block.isInternal) {
          break;
        }
        const fileText = block.content.trim();
        if (fileText) {
          sections.push(`File: ${block.path}\n${fileText}`);
        } else {
          sections.push(`File: ${block.path}`);
        }
        break;
      }
      case MessageBlockType.COMMAND: {
        const command = [block.command, ...block.args].filter(Boolean).join(" ");
        if (command) {
          sections.push(`Command: ${command}`);
        }
        break;
      }
      case MessageBlockType.WEB_SEARCH:
        if (block.query) {
          sections.push(`Web search: ${block.query}`);
        }
        break;
      case MessageBlockType.URL_SCRAPE:
        if (block.status === "error") {
          sections.push(
            `URL scrape failed: ${block.url}${block.error ? ` (${block.error})` : ""}`,
          );
        } else {
          sections.push(
            block.title
              ? `URL scraped: ${block.title}\n${block.url}`
              : `URL scraped: ${block.url}`,
          );
        }
        break;
      case MessageBlockType.INSTALL:
        if (block.dependencies.length > 0) {
          sections.push(
            `Dependencies:\n${block.dependencies.map((dep) => `- ${dep}`).join("\n")}`,
          );
        }
        break;
      case MessageBlockType.SANDBOX:
      case MessageBlockType.DONE:
        break;
    }
  }

  const serialized = sections.join("\n\n").trim();
  return serialized || displayContent.trim();
}

export function useParsedChatMessage(
  message: ChatMessageType,
  isUser: boolean,
) {
  const time = useMemo(
    () => formatMessageTime(message.createdAt),
    [message.createdAt],
  );
  const content = message.content || "";

  const displayContent = useMemo(() => {
    if (!isUser) {
      return content;
    }
    return normalizeUserDisplayContent(content);
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
    () => blocks?.find((block) => block.type === MessageBlockType.SANDBOX),
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

  const hasFiles = fileBlocks.length > 0 || Boolean(sandboxBlock);
  const showFooterButton = hasFiles && !sandboxBlock;

  return {
    time,
    displayContent,
    shouldShowUserText,
    assistantError,
    blocks,
    fileBlocks,
    showFooterButton,
  };
}

interface UseUserMessageVisibilityInput {
  messageId: string;
  displayContent: string;
  isUser: boolean;
  shouldShowUserText: boolean;
}

export function useUserMessageVisibility({
  messageId,
  displayContent,
  isUser,
  shouldShowUserText,
}: UseUserMessageVisibilityInput) {
  const userMessageContentRef = useRef<HTMLDivElement | null>(null);
  const [isUserMessageOverflowing, setIsUserMessageOverflowing] = useState(false);
  const [isUserMessageExpanded, setIsUserMessageExpanded] = useState(false);

  useEffect(() => {
    setIsUserMessageExpanded(false);
  }, [messageId]);

  useEffect(() => {
    const updateOverflowingState = (nextOverflowing: boolean) => {
      setIsUserMessageOverflowing((prev) =>
        prev === nextOverflowing ? prev : nextOverflowing,
      );
    };

    if (!isUser || !shouldShowUserText) {
      updateOverflowingState(false);
      return;
    }

    const node = userMessageContentRef.current;
    if (!node) {
      updateOverflowingState(false);
      return;
    }

    const measureOverflow = () => {
      updateOverflowingState(
        node.scrollHeight - 1 > USER_MESSAGE_COLLAPSE_MAX_HEIGHT_PX,
      );
    };

    measureOverflow();

    window.addEventListener("resize", measureOverflow);
    if (typeof ResizeObserver === "undefined") {
      return () => {
        window.removeEventListener("resize", measureOverflow);
      };
    }

    const resizeObserver = new ResizeObserver(measureOverflow);
    resizeObserver.observe(node);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measureOverflow);
    };
  }, [displayContent, isUser, shouldShowUserText]);

  const canToggleUserMessage =
    isUser && shouldShowUserText && isUserMessageOverflowing;
  const shouldClampUserMessage = canToggleUserMessage && !isUserMessageExpanded;

  return {
    userMessageContentRef,
    isUserMessageExpanded,
    setIsUserMessageExpanded,
    canToggleUserMessage,
    shouldClampUserMessage,
  };
}

interface UseMessageCopyInput {
  isUser: boolean;
  displayContent: string;
  shouldShowUserText: boolean;
  attachments: ChatMessageType["attachments"];
  assistantError: AssistantErrorViewModel | null;
  blocks: MessageBlock[] | null;
}

export function useMessageCopy({
  isUser,
  displayContent,
  shouldShowUserText,
  attachments,
  assistantError,
  blocks,
}: UseMessageCopyInput) {
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    },
    [],
  );

  const resolveCopyContent = useCallback(() => {
    if (isUser) {
      return buildUserCopyContent(displayContent, shouldShowUserText, attachments);
    }

    if (assistantError) {
      return buildAssistantErrorCopyContent(assistantError);
    }

    return buildAssistantCopyContent(displayContent, blocks);
  }, [
    assistantError,
    attachments,
    blocks,
    displayContent,
    isUser,
    shouldShowUserText,
  ]);

  const canCopyMessage = useMemo(() => {
    if (isUser) {
      return shouldShowUserText || (attachments?.length ?? 0) > 0;
    }
    return Boolean(assistantError || displayContent.trim().length > 0);
  }, [assistantError, attachments, displayContent, isUser, shouldShowUserText]);

  const handleCopyMessage = useCallback(async () => {
    if (!canCopyMessage) {
      return;
    }

    const copyContent = resolveCopyContent();
    if (!copyContent) {
      return;
    }

    const copied = await copyTextToClipboard(copyContent);
    if (!copied) {
      toast.error("Copy failed", {
        description: "Couldn't copy this message. Please try again.",
      });
      return;
    }

    toast.success("Message copied");
    setIsCopied(true);
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => {
      setIsCopied(false);
      copyTimeoutRef.current = null;
    }, USER_MESSAGE_COPY_RESET_TIMEOUT_MS);
  }, [canCopyMessage, resolveCopyContent]);

  return {
    isCopied,
    canCopyMessage,
    handleCopyMessage,
  };
}

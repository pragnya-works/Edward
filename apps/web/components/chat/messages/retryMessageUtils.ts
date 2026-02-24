import {
  ChatRole,
  type ChatMessage as ChatMessageType,
  MessageAttachmentType,
} from "@edward/shared/chat/types";
import {
  MessageContentPartType,
  type MessageContent,
} from "@/lib/api/messageContent";
import { normalizeUserMessageText } from "@/lib/userMessageText";

function extractRetryText(content: string | null): string {
  if (!content) {
    return "";
  }
  const normalized = normalizeUserMessageText(content);
  if (!normalized || normalized.toLowerCase() === "[image message]") {
    return "";
  }
  return normalized;
}

export function buildRetryContentFromUserMessage(
  userMessage: ChatMessageType,
): MessageContent | null {
  const text = extractRetryText(userMessage.content);
  const imageParts = (userMessage.attachments ?? [])
    .filter((attachment) => attachment.type === MessageAttachmentType.IMAGE)
    .map((attachment) => ({
      type: MessageContentPartType.IMAGE as const,
      url: attachment.url,
    }));

  if (imageParts.length === 0) {
    return text.length > 0 ? text : null;
  }

  if (text.length === 0) {
    return imageParts;
  }

  return [
    { type: MessageContentPartType.TEXT, text },
    ...imageParts,
  ];
}

export function findLatestUserMessage(
  messages: ChatMessageType[],
): ChatMessageType | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === ChatRole.USER) {
      return message;
    }
  }
  return null;
}

export function findUserMessageForAssistantRetry(
  messages: ChatMessageType[],
  assistantMessageId: string,
): ChatMessageType | null {
  const assistantIndex = messages.findIndex(
    (message) => message.id === assistantMessageId,
  );
  if (assistantIndex <= 0) {
    return null;
  }

  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === ChatRole.USER) {
      return message;
    }
  }

  return null;
}

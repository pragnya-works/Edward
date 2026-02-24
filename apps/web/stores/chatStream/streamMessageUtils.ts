import {
  ChatRole,
  MessageAttachmentType,
  type ChatMessage,
} from "@edward/shared/chat/types";
import {
  MessageContentPartType,
  type MessageContent,
} from "@/lib/api/messageContent";
import { normalizeUserMessageText } from "@/lib/userMessageText";

function extractUserTextFromContent(content: MessageContent): string {
  if (typeof content === "string") {
    const normalized = normalizeUserMessageText(content);
    return normalized.length > 0 ? normalized : "[Image message]";
  }

  const text = content
    .filter((part) => part.type === MessageContentPartType.TEXT)
    .map((part) => normalizeUserMessageText(part.text))
    .filter((value) => value.length > 0)
    .join("\n");
  const normalized = normalizeUserMessageText(text);

  return normalized.length > 0 ? normalized : "[Image message]";
}

function deriveAttachmentName(url: string, index: number): string {
  try {
    const pathname = new URL(url).pathname;
    const lastSegment = pathname.split("/").pop();
    if (lastSegment && lastSegment.length > 0) {
      return decodeURIComponent(lastSegment);
    }
  } catch {
    // Ignore invalid URLs and use a stable fallback name.
  }

  return `Uploaded image ${index + 1}`;
}

function extractImageAttachments(
  content: MessageContent,
  messageId: string,
): ChatMessage["attachments"] | undefined {
  if (typeof content === "string") {
    return undefined;
  }

  const images = content.filter(
    (part) => part.type === MessageContentPartType.IMAGE,
  );

  if (images.length === 0) {
    return undefined;
  }

  return images.map((image, index) => ({
    id: `${messageId}_image_${index}`,
    name: deriveAttachmentName(image.url, index),
    url: image.url,
    type: MessageAttachmentType.IMAGE,
  }));
}

export function buildOptimisticUserMessage(
  chatId: string,
  content: MessageContent,
  id: string,
): ChatMessage {
  const now = new Date().toISOString();
  return {
    id,
    chatId,
    role: ChatRole.USER,
    content: extractUserTextFromContent(content),
    attachments: extractImageAttachments(content, id),
    userId: null,
    createdAt: now,
    updatedAt: now,
    completionTime: null,
    inputTokens: null,
    outputTokens: null,
  };
}

import {
  ChatRole,
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
    userId: null,
    createdAt: now,
    updatedAt: now,
    completionTime: null,
    inputTokens: null,
    outputTokens: null,
  };
}

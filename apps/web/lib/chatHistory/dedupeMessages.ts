import type { ChatMessage } from "@edward/shared/chat/types";

export function dedupeMessagesById(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const deduped: ChatMessage[] = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || seen.has(message.id)) {
      continue;
    }
    seen.add(message.id);
    deduped.push(message);
  }

  deduped.reverse();
  return deduped;
}

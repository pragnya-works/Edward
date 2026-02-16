import type { StreamState, MetaEvent, ChatMessage } from "./chatTypes";

export function buildMessageFromStream(
  stream: StreamState,
  meta: MetaEvent,
): ChatMessage | null {
  if (!meta.assistantMessageId || !meta.chatId) return null;

  const contentParts: string[] = [];
  if (stream.thinkingText) {
    contentParts.push(`<Thinking>\n${stream.thinkingText}\n</Thinking>`);
  }

  for (const file of stream.completedFiles) {
    contentParts.push(
      `<file path="${file.path}">\n${file.content}\n</file>`,
    );
  }
  if (stream.installingDeps.length > 0) {
    const depsList = stream.installingDeps.map((dep) => `- ${dep}`).join("\n");
    contentParts.push(`<edward_install>\n${depsList}\n</edward_install>`);
  }
  if (stream.command) {
    const argsJson = JSON.stringify(stream.command.args);
    contentParts.push(
      `<edward_command command="${stream.command.command}" args='${argsJson}' />`,
    );
  }
  if (stream.streamingText) {
    contentParts.push(stream.streamingText);
  }
  if (contentParts.length === 0) return null;

  const content = contentParts.join("\n\n");

  return {
    id: meta.assistantMessageId,
    chatId: meta.chatId,
    role: "assistant",
    content,
    userId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completionTime: stream.metrics?.completionTime ?? null,
    inputTokens: stream.metrics?.inputTokens ?? null,
    outputTokens: stream.metrics?.outputTokens ?? null,
  };
}

import { ChatRole, type StreamState, type MetaEvent, type ChatMessage } from "./chatTypes";

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

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
  for (const webSearch of stream.webSearches) {
    if (!webSearch.query) continue;
    const query = escapeHtmlAttribute(webSearch.query);
    const maxResultsAttr =
      typeof webSearch.maxResults === "number"
        ? ` max_results="${webSearch.maxResults}"`
        : "";
    contentParts.push(
      `<edward_web_search query="${query}"${maxResultsAttr} />`,
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
    role: ChatRole.ASSISTANT,
    content,
    userId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completionTime: stream.metrics?.completionTime ?? null,
    inputTokens: stream.metrics?.inputTokens ?? null,
    outputTokens: stream.metrics?.outputTokens ?? null,
  };
}

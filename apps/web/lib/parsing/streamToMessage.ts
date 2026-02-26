import type { MetaEvent } from "@edward/shared/streamEvents";
import { ChatRole, type StreamState, type ChatMessage } from "@edward/shared/chat/types";

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function encodeBase64Utf8(value: string): string | null {
  if (typeof globalThis.btoa !== "function") {
    return null;
  }

  try {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const slice = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...slice);
    }
    return globalThis.btoa(binary);
  } catch {
    return null;
  }
}

function encodeBase64Json(value: unknown): string | null {
  try {
    return encodeBase64Utf8(JSON.stringify(value));
  } catch {
    return null;
  }
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
    const commandName = escapeHtmlAttribute(stream.command.command);
    const argsPayload = encodeBase64Json(stream.command.args ?? []);
    const argsAttr = argsPayload ? ` args_b64="${argsPayload}"` : "";
    const exitCodeAttr =
      typeof stream.command.exitCode === "number"
        ? ` exit_code="${stream.command.exitCode}"`
        : "";
    const stdoutAttr = stream.command.stdout
      ? (() => {
          const payload = encodeBase64Json(stream.command.stdout);
          return payload ? ` stdout_b64="${payload}"` : "";
        })()
      : "";
    const stderrAttr = stream.command.stderr
      ? (() => {
          const payload = encodeBase64Json(stream.command.stderr);
          return payload ? ` stderr_b64="${payload}"` : "";
        })()
      : "";
    contentParts.push(
      `<edward_command command="${commandName}"${argsAttr}${exitCodeAttr}${stdoutAttr}${stderrAttr} />`,
    );
  }
  for (const webSearch of stream.webSearches) {
    if (!webSearch.query) continue;
    const query = escapeHtmlAttribute(webSearch.query);
    const maxResultsAttr =
      typeof webSearch.maxResults === "number"
        ? ` max_results="${webSearch.maxResults}"`
        : "";
    const answerAttr = webSearch.answer
      ? (() => {
          const payload = encodeBase64Json(webSearch.answer);
          return payload ? ` answer_b64="${payload}"` : "";
        })()
      : "";
    const errorAttr = webSearch.error
      ? (() => {
          const payload = encodeBase64Json(webSearch.error);
          return payload ? ` error_b64="${payload}"` : "";
        })()
      : "";
    const resultsAttr =
      webSearch.results && webSearch.results.length > 0
        ? (() => {
            const payload = encodeBase64Json(webSearch.results);
            if (!payload) {
              return "";
            }
            return ` results_b64="${payload}" result_count="${webSearch.results!.length}"`;
          })()
        : "";
    contentParts.push(
      `<edward_web_search query="${query}"${maxResultsAttr}${answerAttr}${errorAttr}${resultsAttr} />`,
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

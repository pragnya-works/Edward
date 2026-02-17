import { ParserEventType, type MetaEvent, type StreamState, type StreamedFile } from "@/lib/chatTypes";
import { parseSSELines } from "@/lib/sseParser";
import type { StreamAction } from "./chatStream.reducer";

interface ProcessStreamResponseParams {
  response: Response;
  chatId: string;
  dispatch: React.Dispatch<StreamAction>;
  onMetaRef: React.MutableRefObject<((meta: MetaEvent) => void) | null>;
  thinkingStartRef: React.MutableRefObject<number | null>;
  onChatIdResolved?: (realChatId: string) => void;
}

export interface ProcessedStreamResult {
  meta: MetaEvent | null;
  text: string;
  thinking: string;
  completedFiles: StreamedFile[];
  installingDeps: string[];
  command: StreamState["command"];
  metrics: StreamState["metrics"];
  previewUrl: string | null;
}

export async function processStreamResponse({
  response,
  chatId,
  dispatch,
  onMetaRef,
  thinkingStartRef,
  onChatIdResolved,
}: ProcessStreamResponseParams): Promise<ProcessedStreamResult | null> {
  if (!response.body) {
    dispatch({ type: "SET_ERROR", chatId, error: "No response body" });
    dispatch({ type: "STOP_STREAMING", chatId });
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let metaEvent: MetaEvent | null = null;
  let currentFile: StreamedFile | null = null;
  let activeChatId = chatId;

  const accumulated = {
    text: "",
    thinking: "",
    completedFiles: [] as StreamedFile[],
    deps: [] as string[],
    command: null as StreamState["command"],
    metrics: null as StreamState["metrics"],
    previewUrl: null as string | null,
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const { events, remaining } = parseSSELines(sseBuffer);
    sseBuffer = remaining;

    for (const event of events) {
      switch (event.type) {
        case ParserEventType.META:
          metaEvent = event;
          if (event.chatId !== activeChatId) {
            onChatIdResolved?.(event.chatId);
            activeChatId = event.chatId;
          }
          dispatch({ type: "SET_META", chatId: activeChatId, meta: event });
          onMetaRef.current?.(event);
          break;
        case ParserEventType.TEXT:
          accumulated.text += event.content;
          dispatch({ type: "APPEND_TEXT", chatId: activeChatId, text: event.content });
          break;
        case ParserEventType.THINKING_START:
          thinkingStartRef.current = Date.now();
          dispatch({ type: "START_THINKING", chatId: activeChatId });
          break;
        case ParserEventType.THINKING_CONTENT:
          accumulated.thinking += event.content;
          dispatch({ type: "APPEND_THINKING", chatId: activeChatId, text: event.content });
          break;
        case ParserEventType.THINKING_END: {
          const duration = thinkingStartRef.current
            ? Math.round((Date.now() - thinkingStartRef.current) / 1000)
            : null;
          thinkingStartRef.current = null;
          dispatch({ type: "END_THINKING", chatId: activeChatId, duration });
          break;
        }
        case ParserEventType.FILE_START:
          if (event.path) {
            currentFile = {
              path: event.path,
              content: "",
              isComplete: false,
            };
            dispatch({ type: "START_FILE", chatId: activeChatId, file: { ...currentFile } });
          }
          break;
        case ParserEventType.FILE_CONTENT:
          if (currentFile) {
            currentFile.content += event.content;
            dispatch({
              type: "APPEND_FILE_CONTENT",
              chatId: activeChatId,
              path: currentFile.path,
              content: event.content,
            });
          }
          break;
        case ParserEventType.FILE_END:
          if (currentFile) {
            currentFile.isComplete = true;
            accumulated.completedFiles.push({ ...currentFile });
            dispatch({ type: "COMPLETE_FILE", chatId: activeChatId, path: currentFile.path });
            currentFile = null;
          }
          break;
        case ParserEventType.INSTALL_CONTENT:
          accumulated.deps = event.dependencies;
          dispatch({ type: "SET_INSTALLING_DEPS", chatId: activeChatId, deps: event.dependencies });
          break;
        case ParserEventType.SANDBOX_START:
          dispatch({ type: "SET_SANDBOXING", chatId: activeChatId, isSandboxing: true });
          break;
        case ParserEventType.SANDBOX_END:
          dispatch({ type: "SET_SANDBOXING", chatId: activeChatId, isSandboxing: false });
          break;
        case ParserEventType.COMMAND:
          accumulated.command = event;
          dispatch({ type: "SET_COMMAND", chatId: activeChatId, command: event });
          break;
        case ParserEventType.ERROR:
          dispatch({ type: "SET_ERROR", chatId: activeChatId, error: event.message });
          break;
        case ParserEventType.METRICS:
          accumulated.metrics = {
            completionTime: event.completionTime,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
          };
          dispatch({ type: "SET_METRICS", chatId: activeChatId, metrics: accumulated.metrics });
          break;
        case ParserEventType.PREVIEW_URL:
          accumulated.previewUrl = event.url;
          dispatch({ type: "SET_PREVIEW_URL", chatId: activeChatId, url: event.url });
          break;
      }
    }
  }

  return {
    meta: metaEvent,
    text: accumulated.text,
    thinking: accumulated.thinking,
    completedFiles: accumulated.completedFiles,
    installingDeps: accumulated.deps,
    command: accumulated.command,
    metrics: accumulated.metrics,
    previewUrl: accumulated.previewUrl,
  };
}
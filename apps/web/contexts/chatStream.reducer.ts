import { INITIAL_STREAM_STATE, type MetaEvent, type StreamState, type StreamedFile } from "@/lib/chatTypes";

export type StreamMap = Record<string, StreamState>;

export type StreamAction =
  | { type: "REMOVE_STREAM"; chatId: string }
  | { type: "START_STREAMING"; chatId: string }
  | { type: "STOP_STREAMING"; chatId: string }
  | { type: "SET_ERROR"; chatId: string; error: string }
  | { type: "SET_META"; chatId: string; meta: MetaEvent }
  | { type: "APPEND_TEXT"; chatId: string; text: string }
  | { type: "START_THINKING"; chatId: string }
  | { type: "APPEND_THINKING"; chatId: string; text: string }
  | { type: "END_THINKING"; chatId: string; duration: number | null }
  | { type: "START_FILE"; chatId: string; file: StreamedFile }
  | { type: "APPEND_FILE_CONTENT"; chatId: string; path: string; content: string }
  | { type: "COMPLETE_FILE"; chatId: string; path: string }
  | { type: "SET_INSTALLING_DEPS"; chatId: string; deps: string[] }
  | { type: "SET_SANDBOXING"; chatId: string; isSandboxing: boolean }
  | { type: "SET_COMMAND"; chatId: string; command: StreamState["command"] }
  | { type: "SET_METRICS"; chatId: string; metrics: StreamState["metrics"] }
  | { type: "SET_PREVIEW_URL"; chatId: string; url: string }
  | { type: "RENAME_STREAM"; oldChatId: string; newChatId: string };

function getStream(state: StreamMap, chatId: string): StreamState {
  return state[chatId] ?? INITIAL_STREAM_STATE;
}

function setStream(state: StreamMap, chatId: string, stream: StreamState): StreamMap {
  return { ...state, [chatId]: stream };
}

export function streamReducer(state: StreamMap, action: StreamAction): StreamMap {
  switch (action.type) {
    case "REMOVE_STREAM": {
      const { [action.chatId]: _, ...rest } = state;
      return rest;
    }
    case "START_STREAMING":
      return setStream(state, action.chatId, {
        ...INITIAL_STREAM_STATE,
        isStreaming: true,
        streamChatId: action.chatId,
      });
    case "STOP_STREAMING":
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        isStreaming: false,
      });
    case "SET_ERROR":
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        error: action.error,
      });
    case "SET_META":
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        meta: action.meta,
        streamChatId: action.meta.chatId,
      });
    case "APPEND_TEXT": {
      const s = getStream(state, action.chatId);
      return setStream(state, action.chatId, {
        ...s,
        streamingText: s.streamingText + action.text,
      });
    }
    case "START_THINKING":
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        isThinking: true,
        thinkingDuration: null,
      });
    case "APPEND_THINKING": {
      const s = getStream(state, action.chatId);
      return setStream(state, action.chatId, {
        ...s,
        thinkingText: s.thinkingText + action.text,
      });
    }
    case "END_THINKING":
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        isThinking: false,
        thinkingDuration: action.duration,
      });
    case "START_FILE":
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        activeFiles: [...getStream(state, action.chatId).activeFiles, action.file],
      });
    case "APPEND_FILE_CONTENT": {
      const s = getStream(state, action.chatId);
      return setStream(state, action.chatId, {
        ...s,
        activeFiles: s.activeFiles.map((file) =>
          file.path === action.path
            ? { ...file, content: file.content + action.content }
            : file,
        ),
      });
    }
    case "COMPLETE_FILE": {
      const s = getStream(state, action.chatId);
      const file = s.activeFiles.find((f) => f.path === action.path);
      if (!file) return state;
      return setStream(state, action.chatId, {
        ...s,
        activeFiles: s.activeFiles.filter((f) => f.path !== action.path),
        completedFiles: [...s.completedFiles, { ...file, isComplete: true }],
      });
    }
    case "SET_INSTALLING_DEPS":
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        installingDeps: action.deps,
      });
    case "SET_SANDBOXING":
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        isSandboxing: action.isSandboxing,
      });
    case "SET_COMMAND":
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        command: action.command,
      });
    case "SET_METRICS":
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        metrics: action.metrics,
      });
    case "SET_PREVIEW_URL":
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        previewUrl: action.url,
      });
    case "RENAME_STREAM": {
      const existing = state[action.oldChatId];
      if (!existing) return state;
      const { [action.oldChatId]: _, ...rest } = state;
      return { ...rest, [action.newChatId]: { ...existing, streamChatId: action.newChatId } };
    }
    default:
      return state;
  }
}
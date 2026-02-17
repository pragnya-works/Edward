import {
  INITIAL_STREAM_STATE,
  type MetaEvent,
  type StreamState,
  type StreamedFile,
} from "@/lib/chatTypes";

export type StreamMap = Record<string, StreamState>;

export enum StreamActionType {
  REMOVE_STREAM = "REMOVE_STREAM",
  START_STREAMING = "START_STREAMING",
  STOP_STREAMING = "STOP_STREAMING",
  SET_ERROR = "SET_ERROR",
  SET_META = "SET_META",
  APPEND_TEXT = "APPEND_TEXT",
  START_THINKING = "START_THINKING",
  APPEND_THINKING = "APPEND_THINKING",
  END_THINKING = "END_THINKING",
  START_FILE = "START_FILE",
  APPEND_FILE_CONTENT = "APPEND_FILE_CONTENT",
  COMPLETE_FILE = "COMPLETE_FILE",
  SET_INSTALLING_DEPS = "SET_INSTALLING_DEPS",
  SET_SANDBOXING = "SET_SANDBOXING",
  SET_COMMAND = "SET_COMMAND",
  SET_METRICS = "SET_METRICS",
  SET_PREVIEW_URL = "SET_PREVIEW_URL",
  RENAME_STREAM = "RENAME_STREAM",
}

export type StreamAction =
  | { type: StreamActionType.REMOVE_STREAM; chatId: string }
  | { type: StreamActionType.START_STREAMING; chatId: string }
  | { type: StreamActionType.STOP_STREAMING; chatId: string }
  | { type: StreamActionType.SET_ERROR; chatId: string; error: string }
  | { type: StreamActionType.SET_META; chatId: string; meta: MetaEvent }
  | { type: StreamActionType.APPEND_TEXT; chatId: string; text: string }
  | { type: StreamActionType.START_THINKING; chatId: string }
  | { type: StreamActionType.APPEND_THINKING; chatId: string; text: string }
  | { type: StreamActionType.END_THINKING; chatId: string; duration: number | null }
  | { type: StreamActionType.START_FILE; chatId: string; file: StreamedFile }
  | {
      type: StreamActionType.APPEND_FILE_CONTENT;
      chatId: string;
      path: string;
      content: string;
    }
  | { type: StreamActionType.COMPLETE_FILE; chatId: string; path: string }
  | { type: StreamActionType.SET_INSTALLING_DEPS; chatId: string; deps: string[] }
  | { type: StreamActionType.SET_SANDBOXING; chatId: string; isSandboxing: boolean }
  | { type: StreamActionType.SET_COMMAND; chatId: string; command: StreamState["command"] }
  | { type: StreamActionType.SET_METRICS; chatId: string; metrics: StreamState["metrics"] }
  | { type: StreamActionType.SET_PREVIEW_URL; chatId: string; url: string }
  | { type: StreamActionType.RENAME_STREAM; oldChatId: string; newChatId: string };

function getStream(state: StreamMap, chatId: string): StreamState {
  return state[chatId] ?? INITIAL_STREAM_STATE;
}

function setStream(
  state: StreamMap,
  chatId: string,
  stream: StreamState,
): StreamMap {
  return { ...state, [chatId]: stream };
}

export function streamReducer(
  state: StreamMap,
  action: StreamAction,
): StreamMap {
  switch (action.type) {
    case StreamActionType.REMOVE_STREAM: {
      const { [action.chatId]: _removed, ...rest } = state;
      return rest;
    }
    case StreamActionType.START_STREAMING:
      return setStream(state, action.chatId, {
        ...INITIAL_STREAM_STATE,
        isStreaming: true,
        streamChatId: action.chatId,
      });
    case StreamActionType.STOP_STREAMING:
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        isStreaming: false,
      });
    case StreamActionType.SET_ERROR:
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        error: action.error,
      });
    case StreamActionType.SET_META:
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        meta: action.meta,
        streamChatId: action.meta.chatId,
      });
    case StreamActionType.APPEND_TEXT: {
      const s = getStream(state, action.chatId);
      return setStream(state, action.chatId, {
        ...s,
        streamingText: s.streamingText + action.text,
      });
    }
    case StreamActionType.START_THINKING:
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        isThinking: true,
        thinkingDuration: null,
      });
    case StreamActionType.APPEND_THINKING: {
      const s = getStream(state, action.chatId);
      return setStream(state, action.chatId, {
        ...s,
        thinkingText: s.thinkingText + action.text,
      });
    }
    case StreamActionType.END_THINKING:
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        isThinking: false,
        thinkingDuration: action.duration,
      });
    case StreamActionType.START_FILE:
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        activeFiles: [
          ...getStream(state, action.chatId).activeFiles,
          action.file,
        ],
      });
    case StreamActionType.APPEND_FILE_CONTENT: {
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
    case StreamActionType.COMPLETE_FILE: {
      const s = getStream(state, action.chatId);
      const file = s.activeFiles.find((f) => f.path === action.path);
      if (!file) return state;
      return setStream(state, action.chatId, {
        ...s,
        activeFiles: s.activeFiles.filter((f) => f.path !== action.path),
        completedFiles: [...s.completedFiles, { ...file, isComplete: true }],
      });
    }
    case StreamActionType.SET_INSTALLING_DEPS:
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        installingDeps: action.deps,
      });
    case StreamActionType.SET_SANDBOXING:
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        isSandboxing: action.isSandboxing,
      });
    case StreamActionType.SET_COMMAND:
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        command: action.command,
      });
    case StreamActionType.SET_METRICS:
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        metrics: action.metrics,
      });
    case StreamActionType.SET_PREVIEW_URL:
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        previewUrl: action.url,
      });
    case StreamActionType.RENAME_STREAM: {
      const existing = state[action.oldChatId];
      if (!existing) return state;
      const { [action.oldChatId]: _removed, ...rest } = state;
      return {
        ...rest,
        [action.newChatId]: { ...existing, streamChatId: action.newChatId },
      };
    }
    default:
      return state;
  }
}

import {
  INITIAL_STREAM_STATE,
  type StreamState,
} from "@edward/shared/chat/types";
import {
  StreamActionType,
  type StreamAction,
} from "@edward/shared/chat/streamActions";

export type StreamMap = Record<string, StreamState>;

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

function isSameWebSearch(
  a: NonNullable<StreamState["webSearches"][number]>,
  b: NonNullable<StreamState["webSearches"][number]>,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function hasWebSearchPayload(
  event: NonNullable<StreamState["webSearches"][number]>,
): boolean {
  return Boolean(
    event.error ||
      event.answer ||
      (event.results && event.results.length > 0),
  );
}

function mergeWebSearchEvent(
  existing: StreamState["webSearches"],
  incoming: NonNullable<StreamState["webSearches"][number]>,
): StreamState["webSearches"] {
  const last = existing[existing.length - 1];
  if (!last) {
    return [incoming];
  }

  if (isSameWebSearch(last, incoming)) {
    return existing;
  }

  if (
    last.query === incoming.query &&
    !hasWebSearchPayload(last) &&
    hasWebSearchPayload(incoming)
  ) {
    return [...existing.slice(0, -1), incoming];
  }

  if (
    last.query === incoming.query &&
    !hasWebSearchPayload(last) &&
    !hasWebSearchPayload(incoming)
  ) {
    return existing;
  }

  return [...existing, incoming];
}

function isSameUrlScrape(
  a: NonNullable<StreamState["urlScrapes"][number]>,
  b: NonNullable<StreamState["urlScrapes"][number]>,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
        isThinking: false,
        activeFiles: [],
        installingDeps: [],
        isSandboxing: false,
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
    case StreamActionType.SET_WEB_SEARCH:
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        webSearches: mergeWebSearchEvent(
          getStream(state, action.chatId).webSearches,
          action.webSearch,
        ),
      });
    case StreamActionType.SET_URL_SCRAPE:
      return setStream(state, action.chatId, {
        ...getStream(state, action.chatId),
        urlScrapes: (() => {
          const existing = getStream(state, action.chatId).urlScrapes;
          const last = existing[existing.length - 1];
          if (last && isSameUrlScrape(last, action.urlScrape)) {
            return existing;
          }
          return [...existing, action.urlScrape];
        })(),
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

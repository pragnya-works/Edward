import type {
  MetaEvent,
  StreamState,
  StreamedFile,
} from "@edward/shared/chat/types";

export type StreamActionType =
  | "REMOVE_STREAM"
  | "START_STREAMING"
  | "STOP_STREAMING"
  | "SET_ERROR"
  | "SET_META"
  | "APPEND_TEXT"
  | "START_THINKING"
  | "APPEND_THINKING"
  | "END_THINKING"
  | "START_FILE"
  | "APPEND_FILE_CONTENT"
  | "COMPLETE_FILE"
  | "SET_INSTALLING_DEPS"
  | "SET_SANDBOXING"
  | "SET_COMMAND"
  | "SET_WEB_SEARCH"
  | "SET_URL_SCRAPE"
  | "SET_METRICS"
  | "SET_PREVIEW_URL"
  | "RENAME_STREAM";

export type StreamAction =
  | { type: "REMOVE_STREAM"; chatId: string }
  | { type: "START_STREAMING"; chatId: string }
  | { type: "STOP_STREAMING"; chatId: string }
  | {
    type: "SET_ERROR";
    chatId: string;
    error: NonNullable<StreamState["error"]>;
  }
  | { type: "SET_META"; chatId: string; meta: MetaEvent }
  | { type: "APPEND_TEXT"; chatId: string; text: string }
  | { type: "START_THINKING"; chatId: string }
  | { type: "APPEND_THINKING"; chatId: string; text: string }
  | { type: "END_THINKING"; chatId: string; duration: number | null }
  | { type: "START_FILE"; chatId: string; file: StreamedFile }
  | {
    type: "APPEND_FILE_CONTENT";
    chatId: string;
    path: string;
    content: string;
  }
  | { type: "COMPLETE_FILE"; chatId: string; path: string }
  | { type: "SET_INSTALLING_DEPS"; chatId: string; deps: string[] }
  | { type: "SET_SANDBOXING"; chatId: string; isSandboxing: boolean }
  | { type: "SET_COMMAND"; chatId: string; command: StreamState["command"] }
  | {
    type: "SET_WEB_SEARCH";
    chatId: string;
    webSearch: NonNullable<StreamState["webSearches"][number]>;
  }
  | {
    type: "SET_URL_SCRAPE";
    chatId: string;
    urlScrape: NonNullable<StreamState["urlScrapes"][number]>;
  }
  | { type: "SET_METRICS"; chatId: string; metrics: StreamState["metrics"] }
  | { type: "SET_PREVIEW_URL"; chatId: string; url: string }
  | { type: "RENAME_STREAM"; oldChatId: string; newChatId: string };

export const StreamActionType = {
  REMOVE_STREAM: "REMOVE_STREAM",
  START_STREAMING: "START_STREAMING",
  STOP_STREAMING: "STOP_STREAMING",
  SET_ERROR: "SET_ERROR",
  SET_META: "SET_META",
  APPEND_TEXT: "APPEND_TEXT",
  START_THINKING: "START_THINKING",
  APPEND_THINKING: "APPEND_THINKING",
  END_THINKING: "END_THINKING",
  START_FILE: "START_FILE",
  APPEND_FILE_CONTENT: "APPEND_FILE_CONTENT",
  COMPLETE_FILE: "COMPLETE_FILE",
  SET_INSTALLING_DEPS: "SET_INSTALLING_DEPS",
  SET_SANDBOXING: "SET_SANDBOXING",
  SET_COMMAND: "SET_COMMAND",
  SET_WEB_SEARCH: "SET_WEB_SEARCH",
  SET_URL_SCRAPE: "SET_URL_SCRAPE",
  SET_METRICS: "SET_METRICS",
  SET_PREVIEW_URL: "SET_PREVIEW_URL",
  RENAME_STREAM: "RENAME_STREAM",
} as const satisfies Record<string, StreamActionType>;

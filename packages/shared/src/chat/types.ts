import type {
  MetaEvent,
  CommandEvent,
  ErrorEvent,
  WebSearchEvent,
  UrlScrapeEvent,
  MetricsEvent,
} from "../streamEvents.js";

export enum MessageAttachmentType {
  IMAGE = "image",
  FIGMA = "figma",
}

export enum ChatRole {
  SYSTEM = "system",
  USER = "user",
  ASSISTANT = "assistant",
  DATA = "data",
}

export interface StreamErrorState {
  message: string;
  code?: ErrorEvent["code"];
  details?: ErrorEvent["details"];
  severity?: ErrorEvent["severity"];
}

interface MessageAttachment {
  id: string;
  name: string;
  url: string;
  type: MessageAttachmentType;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: ChatRole;
  content: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  completionTime: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  attachments?: MessageAttachment[];
}

export interface ChatHistoryResponse {
  message: string;
  data: {
    chatId: string;
    messages: ChatMessage[];
  };
}

export interface StreamedFile {
  path: string;
  content: string;
  isComplete: boolean;
}

export interface StreamState {
  isStreaming: boolean;
  streamChatId: string | null;
  streamingText: string;
  textOrder: number | null;
  thinkingText: string;
  isThinking: boolean;
  thinkingDuration: number | null;
  activeFiles: StreamedFile[];
  completedFiles: StreamedFile[];
  installingDeps: string[];
  installOrder: number | null;
  isSandboxing: boolean;
  command: CommandEvent | null;
  projectOrder: number | null;
  webSearches: (WebSearchEvent & { uiOrder?: number })[];
  urlScrapes: (UrlScrapeEvent & { uiOrder?: number })[];
  error: StreamErrorState | null;
  meta: MetaEvent | null;
  codeOnly: boolean;
  previewUrl: string | null;
  metrics: MetricsEvent | null;
}

export const INITIAL_STREAM_STATE: StreamState = {
  isStreaming: false,
  streamChatId: null,
  streamingText: "",
  textOrder: null,
  thinkingText: "",
  isThinking: false,
  thinkingDuration: null,
  activeFiles: [],
  completedFiles: [],
  installingDeps: [],
  installOrder: null,
  isSandboxing: false,
  command: null,
  projectOrder: null,
  webSearches: [],
  urlScrapes: [],
  error: null,
  meta: null,
  codeOnly: false,
  previewUrl: null,
  metrics: null,
};

export enum ParserEventType {
  TEXT = "text",
  THINKING_START = "thinking_start",
  THINKING_CONTENT = "thinking_content",
  THINKING_END = "thinking_end",
  SANDBOX_START = "sandbox_start",
  SANDBOX_END = "sandbox_end",
  FILE_START = "file_start",
  FILE_CONTENT = "file_content",
  FILE_END = "file_end",
  INSTALL_START = "install_start",
  INSTALL_CONTENT = "install_content",
  INSTALL_END = "install_end",
  ERROR = "error",
  META = "meta",
  COMMAND = "command",
  METRICS = "metrics",
  PREVIEW_URL = "preview_url",
}

export interface MetaEvent {
  type: ParserEventType.META;
  chatId: string;
  userMessageId: string;
  assistantMessageId: string;
  isNewChat: boolean;
  intent?: string;
  codeOnly?: boolean;
  tokenUsage?: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens?: number;
    contextWindowTokens: number;
    reservedOutputTokens: number;
    remainingInputTokens: number;
  };
}

export interface TextEvent {
  type: ParserEventType.TEXT;
  content: string;
}

export interface ThinkingStartEvent {
  type: ParserEventType.THINKING_START;
}

export interface ThinkingContentEvent {
  type: ParserEventType.THINKING_CONTENT;
  content: string;
}

export interface ThinkingEndEvent {
  type: ParserEventType.THINKING_END;
}

export interface FileStartEvent {
  type: ParserEventType.FILE_START;
  path: string;
}

export interface FileContentEvent {
  type: ParserEventType.FILE_CONTENT;
  content: string;
}

export interface FileEndEvent {
  type: ParserEventType.FILE_END;
}

export interface SandboxStartEvent {
  type: ParserEventType.SANDBOX_START;
  project?: string;
  base?: string;
}

export interface SandboxEndEvent {
  type: ParserEventType.SANDBOX_END;
}

export interface InstallStartEvent {
  type: ParserEventType.INSTALL_START;
}

export interface InstallContentEvent {
  type: ParserEventType.INSTALL_CONTENT;
  dependencies: string[];
  framework?: string;
}

export interface InstallEndEvent {
  type: ParserEventType.INSTALL_END;
}

export interface ErrorEvent {
  type: ParserEventType.ERROR;
  message: string;
}

export interface CommandEvent {
  type: ParserEventType.COMMAND;
  command: string;
  args?: string[];
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

export interface MetricsEvent {
  type: ParserEventType.METRICS;
  completionTime: number;
  inputTokens: number;
  outputTokens: number;
}

export interface PreviewUrlEvent {
  type: ParserEventType.PREVIEW_URL;
  url: string;
}

export type SSEEvent =
  | MetaEvent
  | TextEvent
  | ThinkingStartEvent
  | ThinkingContentEvent
  | ThinkingEndEvent
  | FileStartEvent
  | FileContentEvent
  | FileEndEvent
  | SandboxStartEvent
  | SandboxEndEvent
  | InstallStartEvent
  | InstallContentEvent
  | InstallEndEvent
  | ErrorEvent
  | CommandEvent
  | MetricsEvent
  | PreviewUrlEvent;

export interface ChatMessage {
  id: string;
  chatId: string;
  role: "system" | "user" | "assistant" | "data";
  content: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  completionTime: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
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
  streamingText: string;
  thinkingText: string;
  isThinking: boolean;
  thinkingDuration: number | null;
  activeFiles: StreamedFile[];
  completedFiles: StreamedFile[];
  installingDeps: string[];
  isSandboxing: boolean;
  command: CommandEvent | null;
  error: string | null;
  meta: MetaEvent | null;
  codeOnly: boolean;
  previewUrl: string | null;
  metrics: {
    completionTime: number;
    inputTokens: number;
    outputTokens: number;
  } | null;
}

export const INITIAL_STREAM_STATE: StreamState = {
  isStreaming: false,
  streamingText: "",
  thinkingText: "",
  isThinking: false,
  thinkingDuration: null,
  activeFiles: [],
  completedFiles: [],
  installingDeps: [],
  isSandboxing: false,
  command: null,
  error: null,
  meta: null,
  codeOnly: false,
  previewUrl: null,
  metrics: null,
};

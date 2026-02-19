export const STREAM_EVENT_VERSION = "v1" as const;
export type StreamEventVersion = typeof STREAM_EVENT_VERSION;

export enum ParserEventType {
  TEXT = "text",
  DONE = "done",
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
  WEB_SEARCH = "web_search",
  URL_SCRAPE = "url_scrape",
  METRICS = "metrics",
  PREVIEW_URL = "preview_url",
  BUILD_STATUS = "build_status",
}

export enum MetaPhase {
  SESSION_START = "session_start",
  TURN_START = "turn_start",
  TURN_COMPLETE = "turn_complete",
  SESSION_COMPLETE = "session_complete",
}

export enum AgentLoopStopReason {
  DONE = "done",
  NO_TOOL_RESULTS = "no_tool_results",
  MAX_TURNS_REACHED = "max_turns_reached",
  TOOL_BUDGET_EXCEEDED = "tool_budget_exceeded",
  CONTEXT_LIMIT_EXCEEDED = "context_limit_exceeded",
  TOOL_PAYLOAD_BUDGET_EXCEEDED = "tool_payload_budget_exceeded",
  CONTINUATION_BUDGET_EXCEEDED = "continuation_budget_exceeded",
  RESPONSE_SIZE_EXCEEDED = "response_size_exceeded",
}

export enum StreamTerminationReason {
  COMPLETED = "completed",
  CLIENT_DISCONNECT = "client_disconnect",
  STREAM_TIMEOUT = "stream_timeout",
  SLOW_CLIENT = "slow_client",
  CONTEXT_LIMIT_EXCEEDED = "context_limit_exceeded",
  TOOL_BUDGET_EXCEEDED = "tool_budget_exceeded",
  TOOL_PAYLOAD_BUDGET_EXCEEDED = "tool_payload_budget_exceeded",
  CONTINUATION_BUDGET_EXCEEDED = "continuation_budget_exceeded",
  RESPONSE_SIZE_EXCEEDED = "response_size_exceeded",
  STREAM_FAILED = "stream_failed",
  ABORTED = "aborted",
}

export interface TokenUsageBreakdown {
  provider: "openai" | "gemini";
  model: string;
  method: "openai-tiktoken" | "gemini-countTokens" | "approx";
  contextWindowTokens: number;
  reservedOutputTokens: number;
  inputTokens: number;
  remainingInputTokens: number;
  perMessage: Array<{
    index: number;
    role: "system" | "user" | "assistant";
    tokens: number;
  }>;
}

interface StreamEventBase {
  type: ParserEventType;
  version: StreamEventVersion;
}

export interface TextEvent extends StreamEventBase {
  type: ParserEventType.TEXT;
  content: string;
}

export interface DoneEvent extends StreamEventBase {
  type: ParserEventType.DONE;
}

export interface ThinkingStartEvent extends StreamEventBase {
  type: ParserEventType.THINKING_START;
}

export interface ThinkingContentEvent extends StreamEventBase {
  type: ParserEventType.THINKING_CONTENT;
  content: string;
}

export interface ThinkingEndEvent extends StreamEventBase {
  type: ParserEventType.THINKING_END;
}

export interface SandboxStartEvent extends StreamEventBase {
  type: ParserEventType.SANDBOX_START;
  project?: string;
  base?: string;
}

export interface SandboxEndEvent extends StreamEventBase {
  type: ParserEventType.SANDBOX_END;
}

export interface FileStartEvent extends StreamEventBase {
  type: ParserEventType.FILE_START;
  path: string;
}

export interface FileContentEvent extends StreamEventBase {
  type: ParserEventType.FILE_CONTENT;
  content: string;
}

export interface FileEndEvent extends StreamEventBase {
  type: ParserEventType.FILE_END;
}

export interface InstallStartEvent extends StreamEventBase {
  type: ParserEventType.INSTALL_START;
}

export interface InstallContentEvent extends StreamEventBase {
  type: ParserEventType.INSTALL_CONTENT;
  dependencies: string[];
  framework?:
    | "nextjs"
    | "vite-react"
    | "vanilla"
    | "next"
    | "react"
    | "vite"
    | "next.js";
}

export interface InstallEndEvent extends StreamEventBase {
  type: ParserEventType.INSTALL_END;
}

export interface ErrorEvent extends StreamEventBase {
  type: ParserEventType.ERROR;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface MetaEvent extends StreamEventBase {
  type: ParserEventType.META;
  chatId: string;
  userMessageId: string;
  assistantMessageId: string;
  isNewChat: boolean;
  runId?: string;
  turn?: number;
  phase?: MetaPhase;
  toolCount?: number;
  loopStopReason?: AgentLoopStopReason;
  intent?: string;
  tokenUsage?: TokenUsageBreakdown;
  terminationReason?: StreamTerminationReason;
}

export interface CommandEvent extends StreamEventBase {
  type: ParserEventType.COMMAND;
  command: string;
  args?: string[];
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchEvent extends StreamEventBase {
  type: ParserEventType.WEB_SEARCH;
  query: string;
  maxResults?: number;
  answer?: string;
  results?: WebSearchResultItem[];
  error?: string;
}

export type UrlScrapeResultItem =
  | {
      status: "success";
      url: string;
      finalUrl: string;
      title: string;
      snippet: string;
    }
  | {
      status: "error";
      url: string;
      error: string;
    };

export interface UrlScrapeEvent extends StreamEventBase {
  type: ParserEventType.URL_SCRAPE;
  results: UrlScrapeResultItem[];
}

export interface MetricsEvent extends StreamEventBase {
  type: ParserEventType.METRICS;
  completionTime: number;
  inputTokens: number;
  outputTokens: number;
}

export interface PreviewUrlEvent extends StreamEventBase {
  type: ParserEventType.PREVIEW_URL;
  url: string;
  chatId?: string;
  runId?: string;
}

export type BuildEventStatus = "queued" | "building" | "success" | "failed";

export interface BuildStatusEvent extends StreamEventBase {
  type: ParserEventType.BUILD_STATUS;
  chatId: string;
  status: BuildEventStatus;
  buildId?: string;
  runId?: string;
  previewUrl?: string | null;
  errorReport?: unknown;
}

export type StreamEvent =
  | TextEvent
  | DoneEvent
  | ThinkingStartEvent
  | ThinkingContentEvent
  | ThinkingEndEvent
  | SandboxStartEvent
  | SandboxEndEvent
  | FileStartEvent
  | FileContentEvent
  | FileEndEvent
  | InstallStartEvent
  | InstallContentEvent
  | InstallEndEvent
  | ErrorEvent
  | MetaEvent
  | CommandEvent
  | WebSearchEvent
  | UrlScrapeEvent
  | MetricsEvent
  | PreviewUrlEvent
  | BuildStatusEvent;

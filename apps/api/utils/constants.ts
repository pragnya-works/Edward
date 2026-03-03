export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  PATCH = "PATCH",
  DELETE = "DELETE",
  OPTIONS = "OPTIONS",
  HEAD = "HEAD",
}

export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  TOO_MANY_REQUESTS = 429,
  MOVED_PERMANENTLY = 301,
  PERMANENT_REDIRECT = 308,
  INTERNAL_SERVER_ERROR = 500,
}

export const ERROR_MESSAGES = {
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN: "Forbidden",
  NOT_FOUND: "Not Found",
  BAD_REQUEST: "Bad Request",
  INTERNAL_SERVER_ERROR: "Internal Server Error",
  VALIDATION_ERROR: "Validation Error",
} as const;

export const VERSION = "1.0.0";
export const NPM_PACKAGE_REGEX =
  /^(?:@[a-z0-9-][a-z0-9-._]*\/)?[a-z0-9-][a-z0-9-._]*$/;
export const MAX_DEPENDENCIES = 50;
export const MAX_PACKAGE_NAME_LENGTH = 214;
export const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
export const MAX_STREAM_DURATION_MS = parsePositiveInt(
  "MAX_STREAM_DURATION_MS",
  20 * 60 * 1000,
);
export const MAX_AGENT_TURNS = parsePositiveInt("MAX_AGENT_TURNS", 12);
export const MAX_AGENT_TOOL_CALLS_PER_TURN = parsePositiveInt(
  "MAX_AGENT_TOOL_CALLS_PER_TURN",
  12,
);

function parsePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export const MAX_AGENT_TOOL_CALLS_PER_RUN = parsePositiveInt(
  "MAX_AGENT_TOOL_CALLS_PER_RUN",
  24,
);
export const MAX_AGENT_CONTINUATION_PROMPT_CHARS = parsePositiveInt(
  "MAX_AGENT_CONTINUATION_PROMPT_CHARS",
  14_000,
);
export const MAX_AGENT_TOOL_RESULT_PAYLOAD_CHARS = parsePositiveInt(
  "MAX_AGENT_TOOL_RESULT_PAYLOAD_CHARS",
  180_000,
);
export const MAX_TOOL_STDIO_CHARS = parsePositiveInt("MAX_TOOL_STDIO_CHARS", 6_000);
export const MAX_RAW_TOOL_STDIO_CHARS = parsePositiveInt(
  "MAX_RAW_TOOL_STDIO_CHARS",
  64_000,
);
export const MAX_WEB_SEARCH_SNIPPET_CHARS = 700;
export const TOOL_GATEWAY_TIMEOUT_MS = parsePositiveInt(
  "TOOL_GATEWAY_TIMEOUT_MS",
  45_000,
);
export const SANDBOX_COMMAND_TIMEOUT_MS = parsePositiveInt(
  "SANDBOX_COMMAND_TIMEOUT_MS",
  45_000,
);
export const SANDBOX_EXEC_MAX_CAPTURE_BYTES = parsePositiveInt(
  "SANDBOX_EXEC_MAX_CAPTURE_BYTES",
  64 * 1024 * 1024,
);
export const TOOL_GATEWAY_RETRY_ATTEMPTS = parsePositiveInt(
  "TOOL_GATEWAY_RETRY_ATTEMPTS",
  2,
);
const LEGACY_WORKER_CONCURRENCY = parsePositiveInt("WORKER_CONCURRENCY", 3);
export const MAX_ACTIVE_RUNS_PER_USER = parsePositiveInt(
  "MAX_ACTIVE_RUNS_PER_USER",
  2,
);
export const MAX_ACTIVE_RUNS_PER_CHAT = parsePositiveInt(
  "MAX_ACTIVE_RUNS_PER_CHAT",
  1,
);
export const MAX_AGENT_QUEUE_DEPTH = parsePositiveInt(
  "MAX_AGENT_QUEUE_DEPTH",
  200,
);
export const BUILD_WORKER_CONCURRENCY = parsePositiveInt(
  "BUILD_WORKER_CONCURRENCY",
  LEGACY_WORKER_CONCURRENCY,
);
const CONFIGURED_AGENT_RUN_WORKER_CONCURRENCY = parsePositiveInt(
  "AGENT_RUN_WORKER_CONCURRENCY",
  LEGACY_WORKER_CONCURRENCY,
);
export const AGENT_RUN_WORKER_CONCURRENCY = Math.max(
  CONFIGURED_AGENT_RUN_WORKER_CONCURRENCY,
  MAX_ACTIVE_RUNS_PER_USER,
);
const RUN_CANCEL_CHANNEL_PREFIX = "edward:run-cancel:";
export function getRunCancelChannel(runId: string): string {
  return `${RUN_CANCEL_CHANNEL_PREFIX}${runId}`;
}
export const RUN_MAX_QUEUED_AGE_MS = parsePositiveInt(
  "RUN_MAX_QUEUED_AGE_MS",
  10 * 60 * 1000,
);
export const RUN_MAX_RUNNING_AGE_MS = parsePositiveInt(
  "RUN_MAX_RUNNING_AGE_MS",
  45 * 60 * 1000,
);
export const RUN_TERMINAL_STATUS_POLL_INTERVAL_MS = parsePositiveInt(
  "RUN_TERMINAL_STATUS_POLL_INTERVAL_MS",
  2_000,
);
export const MAX_SSE_QUEUE_BYTES = 768 * 1024;
export const MAX_SSE_QUEUE_EVENTS = 700;
export const CLEANUP_INTERVAL_MS = 60 * 1000;
export const WORKER_GRACEFUL_SHUTDOWN_TIMEOUT_MS = parsePositiveInt(
  "WORKER_GRACEFUL_SHUTDOWN_TIMEOUT_MS",
  12_000,
);
export const WORKER_BUILD_JOB_TIMEOUT_MS = parsePositiveInt(
  "WORKER_BUILD_JOB_TIMEOUT_MS",
  15 * 60 * 1000,
);
export const WORKER_BACKUP_JOB_TIMEOUT_MS = parsePositiveInt(
  "WORKER_BACKUP_JOB_TIMEOUT_MS",
  5 * 60 * 1000,
);
export const WORKER_REDIS_PUBLISH_RETRY_ATTEMPTS = parsePositiveInt(
  "WORKER_REDIS_PUBLISH_RETRY_ATTEMPTS",
  3,
);
export const WORKER_REDIS_PUBLISH_TIMEOUT_MS = parsePositiveInt(
  "WORKER_REDIS_PUBLISH_TIMEOUT_MS",
  2_000,
);

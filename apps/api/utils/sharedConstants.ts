export const NPM_PACKAGE_REGEX =
  /^(?:@[a-z0-9-][a-z0-9-._]*\/)?[a-z0-9-][a-z0-9-._]*$/;
export const MAX_DEPENDENCIES = 50;
export const MAX_PACKAGE_NAME_LENGTH = 214;
export const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
export const MAX_STREAM_DURATION_MS = 5 * 60 * 1000;
export const MAX_AGENT_TURNS = 5;
export const MAX_AGENT_TOOL_CALLS_PER_TURN = 6;
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
  18,
);
export const MAX_AGENT_CONTINUATION_PROMPT_CHARS = 18_000;
export const MAX_AGENT_TOOL_RESULT_PAYLOAD_CHARS = 24_000;
export const MAX_TOOL_STDIO_CHARS = 4_000;
export const MAX_WEB_SEARCH_SNIPPET_CHARS = 700;
export const TOOL_GATEWAY_TIMEOUT_MS = parsePositiveInt(
  "TOOL_GATEWAY_TIMEOUT_MS",
  15_000,
);
export const TOOL_GATEWAY_RETRY_ATTEMPTS = parsePositiveInt(
  "TOOL_GATEWAY_RETRY_ATTEMPTS",
  2,
);
export const MAX_ACTIVE_RUNS_PER_USER = parsePositiveInt(
  "MAX_ACTIVE_RUNS_PER_USER",
  2,
);
export const MAX_AGENT_QUEUE_DEPTH = parsePositiveInt(
  "MAX_AGENT_QUEUE_DEPTH",
  200,
);
export const WORKER_CONCURRENCY = parsePositiveInt("WORKER_CONCURRENCY", 3);
export const MAX_SSE_QUEUE_BYTES = 768 * 1024;
export const MAX_SSE_QUEUE_EVENTS = 700;
export const CLEANUP_INTERVAL_MS = 60 * 1000;
import { createHash } from "node:crypto";
import {
  getRunToolCallByIdempotencyKey,
  upsertRunToolCall,
} from "@edward/auth";
import { ensureError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";
import { executeSandboxCommand } from "../sandbox/command.service.js";
import {
  MAX_TAVILY_SNIPPET_LENGTH,
  searchTavilyBasic,
  truncateTavilyText,
} from "../websearch/tavily.search.js";
import {
  TOOL_GATEWAY_RETRY_ATTEMPTS,
  TOOL_GATEWAY_TIMEOUT_MS,
} from "../../utils/constants.js";
import { stripAnsiOnly } from "./commandOutput.js";

const TOOL_TIMEOUT_ERROR_NAME = "ToolTimeoutError";

interface ToolTimeoutError extends Error {
  timeoutMs: number;
}

function createToolTimeoutError(timeoutMs: number): ToolTimeoutError {
  const error = Object.assign(
    new Error(`Tool timed out after ${timeoutMs}ms`),
    { timeoutMs },
  );
  error.name = TOOL_TIMEOUT_ERROR_NAME;
  return error;
}

function isToolTimeoutError(error: Error): error is ToolTimeoutError {
  return error.name === TOOL_TIMEOUT_ERROR_NAME;
}

function buildIdempotencyKey(
  runId: string | undefined,
  turn: number,
  toolName: string,
  input: Record<string, unknown>,
): string {
  const payload = JSON.stringify({
    runId: runId ?? "local",
    turn,
    toolName,
    input,
  });
  const digest = createHash("sha256").update(payload).digest("hex");
  return `${toolName}:${turn}:${digest.slice(0, 20)}`;
}

async function withTimeout<T>(
  execute: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(createToolTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([execute(controller.signal), timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

interface ExecuteToolGatewayParams<TOutput> {
  runId?: string;
  turn: number;
  toolName: string;
  input: Record<string, unknown>;
  execute: (signal: AbortSignal) => Promise<TOutput>;
  validateOutput: (value: unknown) => value is TOutput;
  timeoutMs?: number;
  retryAttempts?: number;
}

export async function executeToolWithGateway<TOutput>(
  params: ExecuteToolGatewayParams<TOutput>,
): Promise<TOutput> {
  const timeoutMs = params.timeoutMs ?? TOOL_GATEWAY_TIMEOUT_MS;
  const retryAttempts = Math.max(
    1,
    params.retryAttempts ?? TOOL_GATEWAY_RETRY_ATTEMPTS,
  );
  const idempotencyKey = buildIdempotencyKey(
    params.runId,
    params.turn,
    params.toolName,
    params.input,
  );

  if (params.runId) {
    const cached = await getRunToolCallByIdempotencyKey(
      params.runId,
      idempotencyKey,
    );
    if (cached?.status === "succeeded" && cached.output) {
      if (params.validateOutput(cached.output)) {
        return cached.output;
      }

      logger.warn(
        {
          runId: params.runId,
          toolName: params.toolName,
          turn: params.turn,
          idempotencyKey,
        },
        "Ignoring cached tool output because it failed runtime validation",
      );
    }

    await upsertRunToolCall({
      runId: params.runId,
      turn: params.turn,
      toolName: params.toolName,
      idempotencyKey,
      input: params.input,
      status: "started",
    });
  }

  let lastError: Error | null = null;
  const start = Date.now();

  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      const output = await withTimeout(params.execute, timeoutMs);
      const durationMs = Math.max(0, Date.now() - start);
      logger.debug(
        {
          runId: params.runId,
          toolName: params.toolName,
          turn: params.turn,
          durationMs,
          metric: "tool_latency",
        },
        "Tool gateway execution succeeded",
      );

      if (params.runId) {
        await upsertRunToolCall({
          runId: params.runId,
          turn: params.turn,
          toolName: params.toolName,
          idempotencyKey,
          input: params.input,
          output: output as Record<string, unknown>,
          status: "succeeded",
          durationMs,
        });
      }

      return output;
    } catch (error) {
      lastError = ensureError(error);
      const isTimeout = isToolTimeoutError(lastError);
      logger.warn(
        {
          runId: params.runId,
          toolName: params.toolName,
          attempt,
          retryAttempts,
          error: lastError.message,
          timeout: isTimeout,
          metric: "tool_error",
        },
        "Tool gateway attempt failed",
      );
      if (isTimeout || attempt >= retryAttempts) {
        break;
      }
    }
  }

  if (params.runId) {
    await upsertRunToolCall({
      runId: params.runId,
      turn: params.turn,
      toolName: params.toolName,
      idempotencyKey,
      input: params.input,
      status: "failed",
      errorMessage: lastError?.message ?? "Tool execution failed",
      durationMs: Math.max(0, Date.now() - start),
    });
  }

  throw lastError ?? new Error("Tool execution failed");
}

export interface CommandToolOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCommandToolOutput(value: unknown): value is CommandToolOutput {
  return (
    isRecord(value) &&
    typeof value.exitCode === "number" &&
    typeof value.stdout === "string" &&
    typeof value.stderr === "string"
  );
}

export async function executeCommandTool(params: {
  runId?: string;
  turn: number;
  sandboxId: string;
  command: string;
  args: string[];
}): Promise<CommandToolOutput> {
  return await executeToolWithGateway<CommandToolOutput>({
    runId: params.runId,
    turn: params.turn,
    toolName: "command",
    input: {
      sandboxId: params.sandboxId,
      command: params.command,
      args: params.args,
    },
    validateOutput: isCommandToolOutput,
    execute: async (signal) => {
      const raw = await executeSandboxCommand(
        params.sandboxId,
        {
          command: params.command,
          args: params.args,
        },
        { signal },
      );
      return {
        exitCode: raw.exitCode ?? 0,
        stdout: stripAnsiOnly(raw.stdout ?? ""),
        stderr: stripAnsiOnly(raw.stderr ?? ""),
      };
    },
  });
}

export interface WebSearchToolResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchToolOutput {
  query: string;
  answer?: string;
  results: WebSearchToolResultItem[];
}

function isWebSearchToolResultItem(
  value: unknown,
): value is WebSearchToolResultItem {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.url === "string" &&
    typeof value.snippet === "string"
  );
}

function isWebSearchToolOutput(value: unknown): value is WebSearchToolOutput {
  return (
    isRecord(value) &&
    typeof value.query === "string" &&
    (value.answer === undefined || typeof value.answer === "string") &&
    Array.isArray(value.results) &&
    value.results.every((item) => isWebSearchToolResultItem(item))
  );
}

export async function executeWebSearchTool(params: {
  runId?: string;
  turn: number;
  query: string;
  maxResults: number;
}): Promise<WebSearchToolOutput> {
  return await executeToolWithGateway<WebSearchToolOutput>({
    runId: params.runId,
    turn: params.turn,
    toolName: "web_search",
    input: {
      query: params.query,
      maxResults: params.maxResults,
    },
    validateOutput: isWebSearchToolOutput,
    execute: async (signal) => {
      const raw = await searchTavilyBasic(
        params.query,
        params.maxResults,
        signal,
      );
      return {
        query: raw.query,
        answer: raw.answer
          ? truncateTavilyText(raw.answer, MAX_TAVILY_SNIPPET_LENGTH)
          : undefined,
        results: raw.results.map((item) => ({
          title: item.title,
          url: item.url,
          snippet: item.snippet,
        })),
      };
    },
  });
}

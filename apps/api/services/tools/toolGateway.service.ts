import { createHash } from "node:crypto";
import {
  getRunToolCallByIdempotencyKey,
  upsertRunToolCall,
} from "@edward/auth";
import { ensureError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";
import { executeSandboxCommand } from "../sandbox/command.sandbox.js";
import { searchTavilyBasic } from "../websearch/tavily.search.js";
import {
  MAX_TOOL_STDIO_CHARS,
  MAX_WEB_SEARCH_SNIPPET_CHARS,
  TOOL_GATEWAY_RETRY_ATTEMPTS,
  TOOL_GATEWAY_TIMEOUT_MS,
} from "../../utils/sharedConstants.js";

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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Tool timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

interface ExecuteToolGatewayParams<TOutput> {
  runId?: string;
  turn: number;
  toolName: string;
  input: Record<string, unknown>;
  execute: () => Promise<TOutput>;
  timeoutMs?: number;
  retryAttempts?: number;
}

export async function executeToolWithGateway<TOutput>(
  params: ExecuteToolGatewayParams<TOutput>,
): Promise<TOutput> {
  const timeoutMs = params.timeoutMs ?? TOOL_GATEWAY_TIMEOUT_MS;
  const retryAttempts = Math.max(1, params.retryAttempts ?? TOOL_GATEWAY_RETRY_ATTEMPTS);
  const idempotencyKey = buildIdempotencyKey(
    params.runId,
    params.turn,
    params.toolName,
    params.input,
  );

  if (params.runId) {
    const cached = await getRunToolCallByIdempotencyKey(params.runId, idempotencyKey);
    if (cached?.status === "succeeded" && cached.output) {
      return cached.output as TOutput;
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
      const output = await withTimeout(params.execute(), timeoutMs);
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
      logger.warn(
        {
          runId: params.runId,
          toolName: params.toolName,
          attempt,
          retryAttempts,
          error: lastError.message,
          metric: "tool_error",
        },
        "Tool gateway attempt failed",
      );
      if (attempt >= retryAttempts) {
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

function truncateWithMarker(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }
  return `${content.slice(0, maxChars)}\n...[truncated]`;
}

export interface CommandToolOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function executeCommandTool(params: {
  runId?: string;
  turn: number;
  sandboxId: string;
  command: string;
  args: string[];
}): Promise<CommandToolOutput> {
  const result = await executeToolWithGateway<CommandToolOutput>({
    runId: params.runId,
    turn: params.turn,
    toolName: "command",
    input: {
      sandboxId: params.sandboxId,
      command: params.command,
      args: params.args,
    },
    execute: async () => {
      const raw = await executeSandboxCommand(params.sandboxId, {
        command: params.command,
        args: params.args,
      });
      return {
        exitCode: raw.exitCode ?? 0,
        stdout: truncateWithMarker(raw.stdout ?? "", MAX_TOOL_STDIO_CHARS),
        stderr: truncateWithMarker(raw.stderr ?? "", MAX_TOOL_STDIO_CHARS),
      };
    },
  });

  return result;
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

export async function executeWebSearchTool(params: {
  runId?: string;
  turn: number;
  query: string;
  maxResults: number;
}): Promise<WebSearchToolOutput> {
  const result = await executeToolWithGateway<WebSearchToolOutput>({
    runId: params.runId,
    turn: params.turn,
    toolName: "web_search",
    input: {
      query: params.query,
      maxResults: params.maxResults,
    },
    execute: async () => {
      const raw = await searchTavilyBasic(params.query, params.maxResults);
      return {
        query: raw.query,
        answer: raw.answer
          ? truncateWithMarker(raw.answer, 1_500)
          : undefined,
        results: raw.results.map((item) => ({
          title: item.title,
          url: item.url,
          snippet: truncateWithMarker(item.snippet, MAX_WEB_SEARCH_SNIPPET_CHARS),
        })),
      };
    },
  });

  return result;
}

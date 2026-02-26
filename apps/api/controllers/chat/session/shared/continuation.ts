import { MAX_AGENT_CONTINUATION_PROMPT_CHARS } from "../../../../utils/constants.js";
import { formatToolResults } from "../../command.utils.js";
import type { AgentToolResult } from "@edward/shared/streamToolResults";

const RESPONSE_BLOCK_PATTERN = /<Response>([\s\S]*?)<\/Response>/gi;
const TOOL_BLOCK_SEPARATOR = "\n---\n";
const MAX_PER_TOOL_RESULT_CHARS = 1_600;
const MAX_TOOL_RESULTS_CHARS = 6_000;

function truncateWithMarker(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }
  return `${input.slice(0, maxChars)}\n...[truncated]`;
}

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function truncateMiddle(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }

  const marker = "\n...[truncated]...\n";
  const remaining = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(remaining / 2);
  const tail = Math.floor(remaining / 2);
  return `${input.slice(0, head)}${marker}${input.slice(input.length - tail)}`;
}

function sanitizePreviousResponse(turnRawResponse: string): string {
  let source = String(turnRawResponse ?? "");

  const responseBlocks = [...source.matchAll(RESPONSE_BLOCK_PATTERN)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  if (responseBlocks.length > 0) {
    source = responseBlocks.join("\n\n");
  }

  source = source.replace(/<Thinking>[\s\S]*?<\/Thinking>/gi, " ");
  source = source.replace(/<edward_install>[\s\S]*?<\/edward_install>/gi, " ");
  source = source.replace(/<edward_sandbox[\s\S]*?<\/edward_sandbox>/gi, " ");
  source = source.replace(/<\/?Response>/gi, " ");
  source = source.replace(/<\/?Thinking>/gi, " ");
  source = source.replace(/<\/?edward_[^>]*>/gi, " ");
  source = source.replace(/<\/?[A-Za-z][^>]*>/g, " ");
  source = source.replace(/^\s*thinking\b[:\s-]*/i, "");

  const cleaned = collapseWhitespace(source);
  if (cleaned.length > 0) {
    return cleaned;
  }

  return "No stable plain-text prior response available.";
}

function compactToolResultsForContinuation(toolResults: AgentToolResult[]): string {
  const raw = formatToolResults(toolResults);
  if (!raw) {
    return "";
  }

  const compacted = raw
    .split(TOOL_BLOCK_SEPARATOR)
    .map((block) => truncateMiddle(block, MAX_PER_TOOL_RESULT_CHARS))
    .join(TOOL_BLOCK_SEPARATOR);

  return truncateMiddle(compacted, MAX_TOOL_RESULTS_CHARS);
}

export function buildAgentContinuationPrompt(
  fullUserContent: string,
  turnRawResponse: string,
  toolResults: AgentToolResult[],
): { prompt: string; truncated: boolean } {
  const userContent = truncateWithMarker(fullUserContent, 6_000);
  const previousResponse = truncateWithMarker(
    sanitizePreviousResponse(turnRawResponse),
    4_000,
  );
  const formattedResults = truncateWithMarker(
    compactToolResultsForContinuation(toolResults),
    6_000,
  );

  const prompt = `ORIGINAL REQUEST:\n${userContent}\n\nYOUR PREVIOUS RESPONSE (SANITIZED):\n${previousResponse}\n\nTOOL RESULTS:\n${formattedResults}\n\nContinue with the task using strict Edward tags.
Required output shape:
1) <Thinking>...</Thinking>
2) <Response>...</Response>
If writing files, use <edward_sandbox>...</edward_sandbox> and finish with <edward_done />.
Do not emit malformed/partial tags.`;

  if (prompt.length <= MAX_AGENT_CONTINUATION_PROMPT_CHARS) {
    return { prompt, truncated: false };
  }

  return {
    prompt: truncateWithMarker(prompt, MAX_AGENT_CONTINUATION_PROMPT_CHARS),
    truncated: true,
  };
}

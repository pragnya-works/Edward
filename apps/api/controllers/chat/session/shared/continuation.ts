import { MAX_AGENT_CONTINUATION_PROMPT_CHARS } from "../../../../utils/constants.js";
import { formatToolResults } from "../../command.utils.js";
import type { AgentToolResult } from "@edward/shared/streamToolResults";

const RESPONSE_BLOCK_PATTERN = /<Response>([\s\S]*?)<\/Response>/gi;
const FILE_BLOCK_PATTERN = /<file\b[^>]*path="([^"]+)"[^>]*>([\s\S]*?)<\/file>/gi;
const TOOL_BLOCK_SEPARATOR = "\n---\n";
const MAX_PER_TOOL_RESULT_CHARS = 1_600;
const MAX_TOOL_RESULTS_CHARS = 6_000;
const MAX_PREVIOUS_NARRATIVE_CHARS = 1_200;
const MAX_PREVIOUS_FILES_CHARS = 2_400;
const MAX_PREVIOUS_SOURCE_CHARS = 120_000;
const MAX_FILE_ENTRY_CHARS = 1_200;
const MAX_FILE_CONTEXT_WORKING_CHARS = MAX_PREVIOUS_FILES_CHARS * 3;

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
  if (source.length > MAX_PREVIOUS_SOURCE_CHARS) {
    source = source.slice(-MAX_PREVIOUS_SOURCE_CHARS);
  }

  const responseBlocks = [...source.matchAll(RESPONSE_BLOCK_PATTERN)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  if (responseBlocks.length > 0) {
    source = responseBlocks.join("\n\n");
  }

  const fileContext = extractSandboxFileContext(source);

  source = source.replace(/<Thinking>[\s\S]*?<\/Thinking>/gi, " ");
  source = source.replace(/<edward_install>[\s\S]*?<\/edward_install>/gi, " ");
  source = source.replace(/<edward_sandbox[\s\S]*?<\/edward_sandbox>/gi, " ");
  source = source.replace(/<\/?Response>/gi, " ");
  source = source.replace(/<\/?Thinking>/gi, " ");
  source = source.replace(/<\/?edward_[^>]*>/gi, " ");
  source = source.replace(/<\/?[A-Za-z][^>]*>/g, " ");
  source = source.replace(/^\s*thinking\b[:\s-]*/i, "");

  const cleaned = collapseWhitespace(source);
  const compactNarrative =
    cleaned.length > 0
      ? truncateMiddle(cleaned, MAX_PREVIOUS_NARRATIVE_CHARS)
      : "No stable plain-text prior response available.";

  if (!fileContext) {
    return compactNarrative;
  }

  return `${compactNarrative}\n\nFILES ALREADY EMITTED:\n${fileContext}`;
}

function extractSandboxFileContext(responseSource: string): string {
  const entries: string[] = [];
  let usedChars = 0;

  for (const match of responseSource.matchAll(FILE_BLOCK_PATTERN)) {
    const path = (match[1] ?? "").trim();
    const content = (match[2] ?? "").trim();
    if (!path) {
      continue;
    }
    const compactContent =
      content.length > 0 ? truncateMiddle(content, MAX_FILE_ENTRY_CHARS) : "[empty]";
    const entry = `- ${path}\n${compactContent}`;

    if (usedChars + entry.length > MAX_FILE_CONTEXT_WORKING_CHARS) {
      entries.push("- ...[additional files omitted]");
      break;
    }

    entries.push(entry);
    usedChars += entry.length;
  }

  if (entries.length === 0) {
    return "";
  }

  return truncateMiddle(entries.join("\n\n"), MAX_PREVIOUS_FILES_CHARS);
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

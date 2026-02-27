import { MAX_AGENT_CONTINUATION_PROMPT_CHARS } from "../../../../utils/constants.js";
import { formatToolResults } from "../../command.utils.js";
import type { AgentToolResult } from "@edward/shared/streamToolResults";

const RESPONSE_BLOCK_PATTERN = /<Response>([\s\S]*?)<\/Response>/gi;
const FILE_BLOCK_PATTERN = /<file\b[^>]*path="([^"]+)"[^>]*>([\s\S]*?)<\/file>/gi;
const TOOL_BLOCK_SEPARATOR = "\n---\n";
const ADDITIONAL_FILES_OMITTED_MARKER = "...[additional files omitted]";
const SOFT_CONTINUATION_PROMPT_CHARS = 8_200;

interface ContinuationCaps {
  userChars: number;
  previousNarrativeChars: number;
  previousFilesChars: number;
  previousSourceChars: number;
  fileEntryChars: number;
  toolPerBlockChars: number;
  toolTotalChars: number;
  previousResponseEnvelopeChars: number;
}

const PRIMARY_CONTINUATION_CAPS: ContinuationCaps = {
  userChars: 2_200,
  previousNarrativeChars: 800,
  previousFilesChars: 1_800,
  previousSourceChars: 80_000,
  fileEntryChars: 800,
  toolPerBlockChars: 1_100,
  toolTotalChars: 3_800,
  previousResponseEnvelopeChars: 2_600,
};

const COMPACT_CONTINUATION_CAPS: ContinuationCaps = {
  userChars: 1_200,
  previousNarrativeChars: 400,
  previousFilesChars: 1_000,
  previousSourceChars: 40_000,
  fileEntryChars: 450,
  toolPerBlockChars: 700,
  toolTotalChars: 2_200,
  previousResponseEnvelopeChars: 1_400,
};

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

function truncatePreservingMarker(
  input: string,
  maxChars: number,
  marker: string,
): string {
  if (input.length <= maxChars) {
    return input;
  }

  if (!input.includes(marker)) {
    return truncateWithMarker(input, maxChars);
  }

  const markerSuffix = `\n\n${marker}`;
  const body = input.replace(marker, "").trimEnd();
  const bodyBudget = Math.max(0, maxChars - markerSuffix.length);
  const compactBody = truncateMiddle(body, bodyBudget).trimEnd();
  return `${compactBody}${markerSuffix}`;
}

function sanitizePreviousResponse(
  turnRawResponse: string,
  caps: ContinuationCaps,
): string {
  let source = String(turnRawResponse ?? "");
  if (source.length > caps.previousSourceChars) {
    source = source.slice(-caps.previousSourceChars);
  }

  const responseBlocks = [...source.matchAll(RESPONSE_BLOCK_PATTERN)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  if (responseBlocks.length > 0) {
    source = responseBlocks.join("\n\n");
  }

  const fileContext = extractSandboxFileContext(source, caps);

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
      ? truncateMiddle(cleaned, caps.previousNarrativeChars)
      : "No stable plain-text prior response available.";

  if (!fileContext) {
    return compactNarrative;
  }

  return `${compactNarrative}\n\nFILES ALREADY EMITTED:\n${fileContext}`;
}

function extractSandboxFileContext(
  responseSource: string,
  caps: ContinuationCaps,
): string {
  const maxWorkingChars = caps.previousFilesChars * 3;
  const omissionMarker = `- ${ADDITIONAL_FILES_OMITTED_MARKER}`;
  const entries: string[] = [];
  let usedChars = 0;
  let omittedAdditionalFiles = false;

  for (const match of responseSource.matchAll(FILE_BLOCK_PATTERN)) {
    const path = (match[1] ?? "").trim();
    const content = (match[2] ?? "").trim();
    if (!path) {
      continue;
    }
    const compactContent =
      content.length > 0 ? truncateMiddle(content, caps.fileEntryChars) : "[empty]";
    const entry = `- ${path}\n${compactContent}`;

    if (usedChars + entry.length > maxWorkingChars) {
      entries.push(omissionMarker);
      omittedAdditionalFiles = true;
      break;
    }

    entries.push(entry);
    usedChars += entry.length;
  }

  if (entries.length === 0) {
    return "";
  }

  const joined = entries.join("\n\n");
  if (!omittedAdditionalFiles) {
    return truncateMiddle(joined, caps.previousFilesChars);
  }

  const withoutMarker = joined.replace(omissionMarker, "").trimEnd();
  const markerBudget = omissionMarker.length + 2;
  const prefixBudget = Math.max(0, caps.previousFilesChars - markerBudget);
  const prefix = truncateMiddle(withoutMarker, prefixBudget).trimEnd();
  return `${prefix}\n\n${omissionMarker}`;
}

function compactToolResultsForContinuation(
  toolResults: AgentToolResult[],
  caps: ContinuationCaps,
): string {
  const raw = formatToolResults(toolResults);
  if (!raw) {
    return "";
  }

  const compacted = raw
    .split(TOOL_BLOCK_SEPARATOR)
    .map((block) => truncateMiddle(block, caps.toolPerBlockChars))
    .join(TOOL_BLOCK_SEPARATOR);

  return truncateMiddle(compacted, caps.toolTotalChars);
}

function composeContinuationPrompt(
  userContent: string,
  previousResponse: string,
  formattedResults: string,
): string {
  return `ORIGINAL REQUEST:
${userContent}

YOUR PREVIOUS RESPONSE (SANITIZED):
${previousResponse}

TOOL RESULTS:
${formattedResults}

Continue with valid Edward tags only.
If you write files, emit <edward_sandbox> with complete <file> blocks and end with <edward_done />.
Execute commands/installs/verification yourself using Edward tags whenever possible.
Do not ask the user to run commands or install packages unless blocked by external constraints.
Do not stop at narration-only output.`;
}

function buildPromptWithCaps(
  fullUserContent: string,
  turnRawResponse: string,
  toolResults: AgentToolResult[],
  caps: ContinuationCaps,
): string {
  const userContent = truncateWithMarker(fullUserContent, caps.userChars);
  const previousResponse = truncatePreservingMarker(
    sanitizePreviousResponse(turnRawResponse, caps),
    caps.previousResponseEnvelopeChars,
    ADDITIONAL_FILES_OMITTED_MARKER,
  );
  const formattedResults = truncateWithMarker(
    compactToolResultsForContinuation(toolResults, caps),
    caps.toolTotalChars,
  );

  return composeContinuationPrompt(userContent, previousResponse, formattedResults);
}

export function buildAgentContinuationPrompt(
  fullUserContent: string,
  turnRawResponse: string,
  toolResults: AgentToolResult[],
): { prompt: string; truncated: boolean } {
  let prompt = buildPromptWithCaps(
    fullUserContent,
    turnRawResponse,
    toolResults,
    PRIMARY_CONTINUATION_CAPS,
  );

  if (prompt.length > SOFT_CONTINUATION_PROMPT_CHARS) {
    prompt = buildPromptWithCaps(
      fullUserContent,
      turnRawResponse,
      toolResults,
      COMPACT_CONTINUATION_CAPS,
    );
  }

  if (prompt.length <= MAX_AGENT_CONTINUATION_PROMPT_CHARS) {
    return { prompt, truncated: false };
  }

  return {
    prompt: truncateWithMarker(prompt, MAX_AGENT_CONTINUATION_PROMPT_CHARS),
    truncated: true,
  };
}

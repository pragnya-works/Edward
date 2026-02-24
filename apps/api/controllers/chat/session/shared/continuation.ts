import { MAX_AGENT_CONTINUATION_PROMPT_CHARS } from "../../../../utils/constants.js";
import { formatToolResults } from "../../command.utils.js";
import type { AgentToolResult } from "@edward/shared/streamToolResults";

function truncateWithMarker(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }
  return `${input.slice(0, maxChars)}\n...[truncated]`;
}

export function buildAgentContinuationPrompt(
  fullUserContent: string,
  turnRawResponse: string,
  toolResults: AgentToolResult[],
): { prompt: string; truncated: boolean } {
  const userContent = truncateWithMarker(fullUserContent, 7_000);
  const previousResponse = truncateWithMarker(turnRawResponse, 7_000);
  const formattedResults = truncateWithMarker(
    formatToolResults(toolResults),
    10_000,
  );

  const prompt = `ORIGINAL REQUEST:\n${userContent}\n\nYOUR PREVIOUS RESPONSE:\n${previousResponse}\n\nTOOL RESULTS:\n${formattedResults}\n\nContinue with the task. If you wrote fixes, verify by running the build. If you need more information, use <edward_command> or <edward_web_search>. Do not stop until you have completed the request and emitted <edward_done />.`;

  if (prompt.length <= MAX_AGENT_CONTINUATION_PROMPT_CHARS) {
    return { prompt, truncated: false };
  }

  return {
    prompt: truncateWithMarker(prompt, MAX_AGENT_CONTINUATION_PROMPT_CHARS),
    truncated: true,
  };
}

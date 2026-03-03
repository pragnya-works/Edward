import { ASSISTANT_STREAM_TAGS } from "@edward/shared/llm/streamTagParser";
import { StreamState } from "../../schemas/chat.schema.js";
import type { ParserEventType } from "@edward/shared/streamEvents";
import type { Framework } from "../../services/planning/schemas.js";

export const TAGS = {
  THINKING_START: ASSISTANT_STREAM_TAGS.THINKING_START,
  THINKING_END: ASSISTANT_STREAM_TAGS.THINKING_END,
  SANDBOX_START: ASSISTANT_STREAM_TAGS.SANDBOX_START,
  SANDBOX_END: ASSISTANT_STREAM_TAGS.SANDBOX_END,
  FILE_START: ASSISTANT_STREAM_TAGS.FILE_START,
  FILE_END: ASSISTANT_STREAM_TAGS.FILE_END,
  INSTALL_START: ASSISTANT_STREAM_TAGS.INSTALL_START,
  INSTALL_END: ASSISTANT_STREAM_TAGS.INSTALL_END,
  COMMAND: ASSISTANT_STREAM_TAGS.COMMAND_START,
  WEB_SEARCH: ASSISTANT_STREAM_TAGS.WEB_SEARCH_START,
  RESPONSE_START: ASSISTANT_STREAM_TAGS.RESPONSE_START,
  DONE: ASSISTANT_STREAM_TAGS.DONE_START,
} as const;

export const LOOKAHEAD_LIMIT = 256;
export const MAX_BUFFER_SIZE = 1024 * 10;
export const MAX_ITERATIONS = 1000;

export interface ParserContext {
  state: StreamState;
  buffer: string;
}

export interface TagCandidate {
  idx: number;
  tag: string;
  state: StreamState;
  event: ParserEventType | null;
  isNoop?: boolean;
  isDynamicNoop?: boolean;
}

export interface ExitPoint {
  idx: number;
  type: "end" | "sandbox" | "install" | "response" | "command" | "done";
}

export type SandboxStateSignal =
  | "file"
  | "sandbox_start"
  | "sandbox_end"
  | "done_start";

export type AllowedFramework = Framework | "next" | "react" | "vite" | "next.js";

export const NOOP_CLOSING_TAGS = [
  "</edward_web_search>",
  "</edward_command>",
  "</edward_url_scrape>",
  "</edward_done>",
] as const;

export const CONTROL_CLOSE_TAG_PREFIXES = ["</edward_"] as const;
export const PRESERVED_EDWARD_CLOSING_TAGS = new Set([
  "</edward_install>",
  "</edward_sandbox>",
]);

export function extractTagAttribute(tag: string, attributeName: string): string | undefined {
  // LLM responses occasionally emit escaped quotes in tags; normalize first.
  const normalizedTag = tag.replace(/\\"/g, '"').replace(/\\'/g, "'");
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const quotedPattern = new RegExp(
    `${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
  );
  const quotedMatch = normalizedTag.match(quotedPattern);
  if (quotedMatch) {
    return quotedMatch[1] ?? quotedMatch[2] ?? "";
  }

  const unquotedPattern = new RegExp(`${escapedName}\\s*=\\s*([^\\s>]+)`);
  const unquotedMatch = normalizedTag.match(unquotedPattern);
  return unquotedMatch?.[1];
}

export function stripDanglingControlCloseFragment(content: string): string {
  const lastCloseStart = content.lastIndexOf("</");
  if (lastCloseStart === -1) {
    return content;
  }

  const trailing = content.slice(lastCloseStart).toLowerCase();
  if (trailing.includes(">")) {
    return content;
  }

  if (
    CONTROL_CLOSE_TAG_PREFIXES.some(
      (prefix) => prefix.startsWith(trailing) || trailing.startsWith(prefix),
    )
  ) {
    return content.slice(0, lastCloseStart);
  }

  return content;
}

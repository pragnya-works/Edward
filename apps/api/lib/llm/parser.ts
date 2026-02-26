import path from "path";
import {
  ASSISTANT_STREAM_TAGS,
  decodeHtmlAttribute,
  parseInstallDependencies,
} from "@edward/shared/llm/streamTagParser";
import {
  StreamState,
  ParserEventType,
  type ParserEvent,
} from "../../schemas/chat.schema.js";
import { NPM_PACKAGE_REGEX } from "../../utils/constants.js";
import type { Framework } from "../../services/planning/schemas.js";

const TAGS = {
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

const LOOKAHEAD_LIMIT = 256;
const MAX_BUFFER_SIZE = 1024 * 10;
const MAX_ITERATIONS = 1000;

interface TagCandidate {
  idx: number;
  tag: string;
  state: StreamState;
  event: ParserEventType | null;
  isNoop?: boolean;
  isDynamicNoop?: boolean;
}

interface ExitPoint {
  idx: number;
  type: "end" | "sandbox" | "install" | "response" | "command" | "done";
}

type SandboxStateSignal =
  | "file"
  | "sandbox_start"
  | "sandbox_end"
  | "done_start";

type AllowedFramework = Framework | "next" | "react" | "vite" | "next.js";
const NOOP_CLOSING_TAGS = [
  "</edward_web_search>",
  "</edward_command>",
  "</edward_url_scrape>",
  "</edward_done>",
] as const;
const CONTROL_CLOSE_TAG_PREFIXES = ["</edward_"] as const;
const PRESERVED_EDWARD_CLOSING_TAGS = new Set([
  "</edward_install>",
  "</edward_sandbox>",
]);

function extractTagAttribute(tag: string, attributeName: string): string | undefined {
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

function stripDanglingControlCloseFragment(content: string): string {
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

export function createStreamParser() {
  let state: StreamState = StreamState.TEXT;
  let buffer = "";

  function handleState(events: ParserEvent[]): void {
    switch (state) {
      case StreamState.TEXT:
        handleTextState(events);
        break;
      case StreamState.THINKING:
        handleThinkingState(events);
        break;
      case StreamState.SANDBOX:
        handleSandboxState(events);
        break;
      case StreamState.FILE:
        handleFileState(events);
        break;
      case StreamState.INSTALL:
        handleInstallState(events);
        break;
    }
  }

  function emitContentEvent(
    events: ParserEvent[],
    type:
      | ParserEventType.TEXT
      | ParserEventType.THINKING_CONTENT
      | ParserEventType.FILE_CONTENT,
    content: string,
  ): void {
    if (!content) {
      return;
    }

    const sanitized =
      type === ParserEventType.FILE_CONTENT
        ? content
        : stripDanglingControlCloseFragment(content);
    if (!sanitized) {
      return;
    }

    events.push({ type, content: sanitized } as ParserEvent);
  }

  function handleTextState(events: ParserEvent[]): void {
    const candidates: TagCandidate[] = [
      {
        idx: buffer.indexOf(TAGS.DONE),
        tag: TAGS.DONE,
        state: StreamState.TEXT,
        event: ParserEventType.DONE,
      },
      {
        idx: buffer.indexOf(TAGS.THINKING_START),
        tag: TAGS.THINKING_START,
        state: StreamState.THINKING,
        event: ParserEventType.THINKING_START,
      },
      {
        idx: buffer.indexOf(TAGS.SANDBOX_START),
        tag: TAGS.SANDBOX_START,
        state: StreamState.SANDBOX,
        event: null,
      },
      {
        idx: buffer.indexOf(TAGS.INSTALL_START),
        tag: TAGS.INSTALL_START,
        state: StreamState.INSTALL,
        event: ParserEventType.INSTALL_START,
      },
      {
        idx: buffer.indexOf(TAGS.COMMAND),
        tag: TAGS.COMMAND,
        state: StreamState.TEXT,
        event: ParserEventType.COMMAND,
      },
      {
        idx: buffer.indexOf(TAGS.WEB_SEARCH),
        tag: TAGS.WEB_SEARCH,
        state: StreamState.TEXT,
        event: ParserEventType.WEB_SEARCH,
      },
      ...NOOP_CLOSING_TAGS.map((tag) => ({
        idx: buffer.indexOf(tag),
        tag,
        state: StreamState.TEXT,
        event: null,
        isNoop: true,
      })),
      {
        idx: buffer.indexOf("</edward_"),
        tag: "</edward_",
        state: StreamState.TEXT,
        event: null,
        isNoop: true,
        isDynamicNoop: true,
      },
    ].filter((c) => c.idx !== -1);

    if (candidates.length === 0) {
      flushSafeContent(events, ParserEventType.TEXT);
      return;
    }

    const next = candidates.reduce((min, c) => (c.idx < min.idx ? c : min));

    if (next.idx > 0) {
      const textContent = buffer.slice(0, next.idx);
      emitContentEvent(events, ParserEventType.TEXT, textContent);
    }
    buffer = buffer.slice(next.idx);

    if (next.isNoop) {
      if (next.isDynamicNoop) {
        const closeAngle = buffer.indexOf(">");
        if (closeAngle === -1) return;
        const closingTag = buffer.slice(0, closeAngle + 1);
        if (PRESERVED_EDWARD_CLOSING_TAGS.has(closingTag.toLowerCase())) {
          emitContentEvent(events, ParserEventType.TEXT, closingTag);
        }
        buffer = buffer.slice(closeAngle + 1);
      } else {
        buffer = buffer.slice(next.tag.length);
      }
      return;
    }

    if (buffer.startsWith(TAGS.THINKING_START)) {
      buffer = buffer.slice(TAGS.THINKING_START.length);
      state = StreamState.THINKING;
      events.push({ type: ParserEventType.THINKING_START });
    } else if (buffer.startsWith(TAGS.DONE)) {
      processDoneTag(events);
    } else if (buffer.startsWith(TAGS.SANDBOX_START)) {
      processSandboxOpenTag(events);
    } else if (buffer.startsWith(TAGS.INSTALL_START)) {
      const startTagEnd = buffer.indexOf(">");
      if (startTagEnd !== -1) {
        buffer = buffer.slice(startTagEnd + 1);
        state = StreamState.INSTALL;
        events.push({ type: ParserEventType.INSTALL_START });
      }
    } else if (buffer.startsWith("<edward_command")) {
      const closeAngle = buffer.indexOf(">");
      if (closeAngle === -1) return;

      const tagContent = buffer.slice(0, closeAngle + 1);
      buffer = buffer.slice(closeAngle + 1);

      const command = extractTagAttribute(tagContent, "command");
      if (!command) {
        events.push({
          type: ParserEventType.ERROR,
          message: 'edward_command tag missing required "command" attribute',
          code: "malformed_edward_command_tag",
          severity: "recoverable",
        });
      } else {
        let args: string[] = [];
        const argsRaw = extractTagAttribute(tagContent, "args");
        if (argsRaw) {
          try {
            args = JSON.parse(argsRaw);
          } catch {
            /* malformed JSON — keep empty args */
          }
        }
        events.push({ type: ParserEventType.COMMAND, command, args });
      }
    } else if (buffer.startsWith("<edward_web_search")) {
      const closeAngle = buffer.indexOf(">");
      if (closeAngle === -1) return;

      const tagContent = buffer.slice(0, closeAngle + 1);
      buffer = buffer.slice(closeAngle + 1);

      const queryRaw = extractTagAttribute(tagContent, "query");
      const query = decodeHtmlAttribute(queryRaw ?? "").trim();
      if (!query) {
        events.push({
          type: ParserEventType.ERROR,
          message: 'edward_web_search tag missing required "query" attribute',
          code: "malformed_edward_web_search_tag",
          severity: "recoverable",
        });
      } else {
        const maxRaw =
          extractTagAttribute(tagContent, "max_results") ??
          extractTagAttribute(tagContent, "maxResults");
        const maxResults = maxRaw ? Number.parseInt(maxRaw, 10) : undefined;
        events.push({
          type: ParserEventType.WEB_SEARCH,
          query,
          maxResults,
        });
      }
    }
  }

  function handleThinkingState(events: ParserEvent[]): void {
    const exitPoints: ExitPoint[] = [
      { idx: buffer.indexOf(TAGS.THINKING_END), type: "end" as const },
      { idx: buffer.indexOf(TAGS.SANDBOX_START), type: "sandbox" as const },
      { idx: buffer.indexOf(TAGS.INSTALL_START), type: "install" as const },
      { idx: buffer.indexOf(TAGS.RESPONSE_START), type: "response" as const },
      { idx: buffer.indexOf(TAGS.COMMAND), type: "command" as const },
      { idx: buffer.indexOf(TAGS.WEB_SEARCH), type: "command" as const },
      { idx: buffer.indexOf(TAGS.DONE), type: "done" as const },
    ].filter((p) => p.idx !== -1);

    if (exitPoints.length === 0) {
      flushSafeContent(events, ParserEventType.THINKING_CONTENT);
      return;
    }

    const earliest = exitPoints.reduce((min, p) => (p.idx < min.idx ? p : min));

    if (earliest.idx > 0) {
      const content = buffer.slice(0, earliest.idx);
      emitContentEvent(events, ParserEventType.THINKING_CONTENT, content);
    }

    if (earliest.type === "end") {
      buffer = buffer.slice(earliest.idx + TAGS.THINKING_END.length);
    } else {
      buffer = buffer.slice(earliest.idx);
    }

    state = StreamState.TEXT;
    events.push({ type: ParserEventType.THINKING_END });
  }

  function handleSandboxState(events: ParserEvent[]): void {
    const signals: Array<{ idx: number; type: SandboxStateSignal }> = [
      { idx: buffer.indexOf(TAGS.FILE_START), type: "file" as const },
      {
        idx: buffer.indexOf(TAGS.SANDBOX_START),
        type: "sandbox_start" as const,
      },
      { idx: buffer.indexOf(TAGS.SANDBOX_END), type: "sandbox_end" as const },
      { idx: buffer.indexOf(TAGS.DONE), type: "done_start" as const },
    ].filter((signal) => signal.idx !== -1);

    if (signals.length === 0) {
      flushSandboxContent(events);
      return;
    }

    const earliest = signals.reduce((min, signal) =>
      signal.idx < min.idx ? signal : min,
    );

    if (earliest.type === "file") {
      processFileOpenTag(events, earliest.idx);
      return;
    }

    if (earliest.type === "sandbox_start") {
      const closeIdx = buffer.indexOf(">", earliest.idx);
      if (closeIdx === -1) {
        return;
      }
      buffer = buffer.slice(closeIdx + 1);
      return;
    }

    if (earliest.type === "sandbox_end") {
      buffer = buffer.slice(earliest.idx + TAGS.SANDBOX_END.length);
      state = StreamState.TEXT;
      events.push({ type: ParserEventType.SANDBOX_END });
      return;
    }

    // Recover from malformed outputs (e.g. missing </edward_sandbox>) by
    // implicitly closing sandbox before parsing <edward_done />.
    state = StreamState.TEXT;
    events.push({ type: ParserEventType.SANDBOX_END });
    handleTextState(events);
  }

  function handleFileState(events: ParserEvent[]): void {
    const endIdx = buffer.indexOf(TAGS.FILE_END);

    if (endIdx !== -1) {
      if (endIdx > 0) {
        let content = buffer.slice(0, endIdx);

        if (content) {
          content = cleanFileContent(content);
          emitContentEvent(events, ParserEventType.FILE_CONTENT, content);
        }
      }
      buffer = buffer.slice(endIdx + TAGS.FILE_END.length);
      state = StreamState.SANDBOX;
      events.push({ type: ParserEventType.FILE_END });
    } else {
      flushSafeContent(events, ParserEventType.FILE_CONTENT);
    }
  }

  function cleanFileContent(content: string): string {
    let cleaned = content;
    let changed = true;

    while (changed) {
      changed = false;
      const trimmed = cleaned.trim();
      if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
        const firstNewline = trimmed.indexOf("\n");
        const lastFence = trimmed.lastIndexOf("```");
        if (firstNewline !== -1 && lastFence > firstNewline) {
          cleaned = trimmed.slice(firstNewline + 1, lastFence).trim();
          changed = true;
          continue;
        }
      }

      // CDATA stripping
      if (trimmed.startsWith("<![CDATA[") && trimmed.endsWith("]]>")) {
        cleaned = trimmed.slice("<![CDATA[".length, -3).trim();
        changed = true;
        continue;
      }
    }

    return cleaned
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  function handleInstallState(events: ParserEvent[]): void {
    const endIdx = buffer.indexOf(TAGS.INSTALL_END);

    if (endIdx !== -1) {
      const content = buffer.slice(0, endIdx).trim();
      if (content) {
        const parsed = parseInstallContent(content);
        events.push({
          type: ParserEventType.INSTALL_CONTENT,
          dependencies: parsed.dependencies,
          framework: parsed.framework,
        });
      }
      buffer = buffer.slice(endIdx + TAGS.INSTALL_END.length);
      state = StreamState.TEXT;
      events.push({ type: ParserEventType.INSTALL_END });
    }
  }

  function processSandboxOpenTag(events: ParserEvent[]): void {
    const closeIdx = buffer.indexOf(">");
    if (closeIdx === -1) return;

    const tag = buffer.slice(0, closeIdx + 1);
    const projectMatch = extractTagAttribute(tag, "project");
    const baseMatch = extractTagAttribute(tag, "base");

    events.push({
      type: ParserEventType.SANDBOX_START,
      project: projectMatch,
      base: baseMatch,
    });
    buffer = buffer.slice(closeIdx + 1);
    state = StreamState.SANDBOX;
  }

  function processFileOpenTag(events: ParserEvent[], fileIdx: number): void {
    const closeIdx = buffer.indexOf(">", fileIdx);
    if (closeIdx === -1) return;

    if (fileIdx > 0) {
      const textContent = buffer.slice(0, fileIdx);
      if (textContent.trim()) {
        emitContentEvent(events, ParserEventType.TEXT, textContent);
      }
    }

    const tag = buffer.slice(fileIdx, closeIdx + 1);
    const rawPath = extractTagAttribute(tag, "path");

    if (!rawPath?.trim()) {
      events.push({
        type: ParserEventType.ERROR,
        message: "Invalid file tag: missing or empty path",
        code: "invalid_file_tag",
        severity: "recoverable",
      });
      buffer = buffer.slice(closeIdx + 1);
      return;
    }

    const normalizedPath = path.posix
      .normalize(rawPath)
      .replace(/^(\.\.{1,2}(\/|\\|$))+/, "");

    if (!normalizedPath) {
      events.push({
        type: ParserEventType.ERROR,
        message: `Invalid file path after normalization: ${rawPath}`,
        code: "invalid_file_path",
        severity: "recoverable",
      });
      buffer = buffer.slice(closeIdx + 1);
      return;
    }

    events.push({ type: ParserEventType.FILE_START, path: normalizedPath });
    buffer = buffer.slice(closeIdx + 1);
    state = StreamState.FILE;
  }

  function processDoneTag(events: ParserEvent[]): void {
    const closeIdx = buffer.indexOf(">");
    if (closeIdx === -1) return;

    events.push({ type: ParserEventType.DONE });
    buffer = buffer.slice(closeIdx + 1);
    state = StreamState.TEXT;
  }

  function flushSafeContent(
    events: ParserEvent[],
    type:
      | ParserEventType.TEXT
      | ParserEventType.THINKING_CONTENT
      | ParserEventType.FILE_CONTENT,
  ): void {
    const lastLt = buffer.lastIndexOf("<");

    if (lastLt !== -1 && buffer.length - lastLt < LOOKAHEAD_LIMIT) {
      if (lastLt > 0) {
        emitContentEvent(events, type, buffer.slice(0, lastLt));
        buffer = buffer.slice(lastLt);
      }
    } else if (buffer.length > 0) {
      emitContentEvent(events, type, buffer);
      buffer = "";
    }
  }

  function flushSandboxContent(events: ParserEvent[]): void {
    const lastLt = buffer.lastIndexOf("<");

    if (lastLt !== -1 && buffer.length - lastLt < LOOKAHEAD_LIMIT) {
      if (buffer.length > LOOKAHEAD_LIMIT && lastLt > 0) {
        const safeContent = buffer.slice(0, lastLt);
        if (safeContent.trim()) {
          emitContentEvent(events, ParserEventType.TEXT, safeContent);
        }
        buffer = buffer.slice(lastLt);
      }
    } else if (lastLt === -1 && buffer.length > LOOKAHEAD_LIMIT) {
      const safeContent = buffer;
      if (safeContent.trim()) {
        emitContentEvent(events, ParserEventType.TEXT, safeContent);
      }
      buffer = "";
    }
  }

  function parseInstallContent(content: string): {
    dependencies: string[];
    framework?: AllowedFramework;
  } {
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let framework: AllowedFramework | undefined;
    const dependencies = parseInstallDependencies(content).filter(
      isValidPackageName,
    );

    for (const line of lines) {
      const cleanLine = line.replace(/^\s*[-*]\s*/, "").trim();

      if (cleanLine.startsWith("framework:")) {
        const rawFramework = cleanLine.replace("framework:", "").trim();
        const validFrameworks: AllowedFramework[] = [
          "nextjs",
          "vite-react",
          "vanilla",
          "next",
          "react",
          "vite",
          "next.js",
        ];
        framework = validFrameworks.includes(rawFramework as AllowedFramework)
          ? (rawFramework as AllowedFramework)
          : undefined;
      }
    }

    return { dependencies, framework };
  }

  function isValidPackageName(name: string): boolean {
    return (
      Boolean(name) &&
      !name.includes("<") &&
      !name.includes(">") &&
      NPM_PACKAGE_REGEX.test(name)
    );
  }

  function process(chunk: string): ParserEvent[] {
    if (!chunk || typeof chunk !== "string") {
      return [];
    }

    buffer += chunk;

    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer = buffer.slice(buffer.length - MAX_BUFFER_SIZE);
    }

    const events: ParserEvent[] = [];
    let prevLen = -1;
    let iterations = 0;

    while (
      buffer.length > 0 &&
      buffer.length !== prevLen &&
      iterations < MAX_ITERATIONS
    ) {
      prevLen = buffer.length;
      handleState(events);
      iterations++;
    }

    if (iterations >= MAX_ITERATIONS) {
      events.push({
        type: ParserEventType.ERROR,
        message:
          "Parser exceeded maximum iterations - possible infinite loop detected",
        code: "parser_iterations_exceeded",
        severity: "fatal",
      });
      buffer = "";
      state = StreamState.TEXT;
    }

    return events;
  }

  function flush(): ParserEvent[] {
    const events: ParserEvent[] = [];

    if (buffer.length > 0) {
      switch (state) {
        case StreamState.TEXT:
          emitContentEvent(events, ParserEventType.TEXT, buffer);
          break;

        case StreamState.THINKING:
          emitContentEvent(events, ParserEventType.THINKING_CONTENT, buffer);
          events.push({ type: ParserEventType.THINKING_END });
          break;

        case StreamState.FILE:
          emitContentEvent(events, ParserEventType.FILE_CONTENT, buffer);
          events.push(
            { type: ParserEventType.FILE_END },
            { type: ParserEventType.SANDBOX_END },
          );
          break;

        case StreamState.SANDBOX:
          events.push({ type: ParserEventType.SANDBOX_END });
          break;

        case StreamState.INSTALL: {
          const content = buffer.trim();
          if (content) {
            const parsed = parseInstallContent(content);
            events.push({
              type: ParserEventType.INSTALL_CONTENT,
              dependencies: parsed.dependencies,
              framework: parsed.framework,
            });
          }
          events.push({ type: ParserEventType.INSTALL_END });
          break;
        }
      }
      buffer = "";
    }

    state = StreamState.TEXT;
    return events;
  }

  return { process, flush };
}

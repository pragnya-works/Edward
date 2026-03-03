import { decodeHtmlAttribute } from "@edward/shared/llm/streamTagParser";
import {
  StreamState,
  type ParserEvent,
} from "../../schemas/chat.schema.js";
import { ParserEventType } from "@edward/shared/streamEvents";
import type {
  ExitPoint,
  ParserContext,
  SandboxStateSignal,
  TagCandidate,
} from "./parser.shared.js";
import {
  NOOP_CLOSING_TAGS,
  PRESERVED_EDWARD_CLOSING_TAGS,
  TAGS,
  extractTagAttribute,
} from "./parser.shared.js";
import {
  emitContentEvent,
  flushSafeContent,
  flushSandboxContent,
  processDoneTag,
  processFileOpenTag,
} from "./parser.content.js";

export function processSandboxOpenTag(
  context: ParserContext,
  events: ParserEvent[],
): void {
  const closeIdx = context.buffer.indexOf(">");
  if (closeIdx === -1) return;

  const tag = context.buffer.slice(0, closeIdx + 1);
  const projectMatch = extractTagAttribute(tag, "project");
  const baseMatch = extractTagAttribute(tag, "base");

  events.push({
    type: ParserEventType.SANDBOX_START,
    project: projectMatch,
    base: baseMatch,
  });
  context.buffer = context.buffer.slice(closeIdx + 1);
  context.state = StreamState.SANDBOX;
}

export function handleTextState(
  context: ParserContext,
  events: ParserEvent[],
): void {
  const candidates: TagCandidate[] = [
    {
      idx: context.buffer.indexOf(TAGS.DONE),
      tag: TAGS.DONE,
      state: StreamState.TEXT,
      event: ParserEventType.DONE,
    },
    {
      idx: context.buffer.indexOf(TAGS.THINKING_START),
      tag: TAGS.THINKING_START,
      state: StreamState.THINKING,
      event: ParserEventType.THINKING_START,
    },
    {
      idx: context.buffer.indexOf(TAGS.SANDBOX_START),
      tag: TAGS.SANDBOX_START,
      state: StreamState.SANDBOX,
      event: null,
    },
    {
      idx: context.buffer.indexOf(TAGS.INSTALL_START),
      tag: TAGS.INSTALL_START,
      state: StreamState.INSTALL,
      event: ParserEventType.INSTALL_START,
    },
    {
      idx: context.buffer.indexOf(TAGS.COMMAND),
      tag: TAGS.COMMAND,
      state: StreamState.TEXT,
      event: ParserEventType.COMMAND,
    },
    {
      idx: context.buffer.indexOf(TAGS.WEB_SEARCH),
      tag: TAGS.WEB_SEARCH,
      state: StreamState.TEXT,
      event: ParserEventType.WEB_SEARCH,
    },
    ...NOOP_CLOSING_TAGS.map((tag) => ({
      idx: context.buffer.indexOf(tag),
      tag,
      state: StreamState.TEXT,
      event: null,
      isNoop: true,
    })),
    {
      idx: context.buffer.indexOf("</edward_"),
      tag: "</edward_",
      state: StreamState.TEXT,
      event: null,
      isNoop: true,
      isDynamicNoop: true,
    },
  ].filter((c) => c.idx !== -1);

  if (candidates.length === 0) {
    flushSafeContent(context, events, ParserEventType.TEXT);
    return;
  }

  const next = candidates.reduce((min, c) => (c.idx < min.idx ? c : min));

  if (next.idx > 0) {
    const textContent = context.buffer.slice(0, next.idx);
    emitContentEvent(events, ParserEventType.TEXT, textContent);
  }
  context.buffer = context.buffer.slice(next.idx);

  if (next.isNoop) {
    if (next.isDynamicNoop) {
      const closeAngle = context.buffer.indexOf(">");
      if (closeAngle === -1) return;
      const closingTag = context.buffer.slice(0, closeAngle + 1);
      if (PRESERVED_EDWARD_CLOSING_TAGS.has(closingTag.toLowerCase())) {
        emitContentEvent(events, ParserEventType.TEXT, closingTag);
      }
      context.buffer = context.buffer.slice(closeAngle + 1);
    } else {
      context.buffer = context.buffer.slice(next.tag.length);
    }
    return;
  }

  if (context.buffer.startsWith(TAGS.THINKING_START)) {
    context.buffer = context.buffer.slice(TAGS.THINKING_START.length);
    context.state = StreamState.THINKING;
    events.push({ type: ParserEventType.THINKING_START });
  } else if (context.buffer.startsWith(TAGS.DONE)) {
    processDoneTag(context, events);
  } else if (context.buffer.startsWith(TAGS.SANDBOX_START)) {
    processSandboxOpenTag(context, events);
  } else if (context.buffer.startsWith(TAGS.INSTALL_START)) {
    const startTagEnd = context.buffer.indexOf(">");
    if (startTagEnd !== -1) {
      context.buffer = context.buffer.slice(startTagEnd + 1);
      context.state = StreamState.INSTALL;
      events.push({ type: ParserEventType.INSTALL_START });
    }
  } else if (context.buffer.startsWith("<edward_command")) {
    const closeAngle = context.buffer.indexOf(">");
    if (closeAngle === -1) return;

    const tagContent = context.buffer.slice(0, closeAngle + 1);
    context.buffer = context.buffer.slice(closeAngle + 1);

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
  } else if (context.buffer.startsWith("<edward_web_search")) {
    const closeAngle = context.buffer.indexOf(">");
    if (closeAngle === -1) return;

    const tagContent = context.buffer.slice(0, closeAngle + 1);
    context.buffer = context.buffer.slice(closeAngle + 1);

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

export function handleThinkingState(
  context: ParserContext,
  events: ParserEvent[],
): void {
  const exitPoints: ExitPoint[] = [
    { idx: context.buffer.indexOf(TAGS.THINKING_END), type: "end" as const },
    { idx: context.buffer.indexOf(TAGS.SANDBOX_START), type: "sandbox" as const },
    { idx: context.buffer.indexOf(TAGS.INSTALL_START), type: "install" as const },
    { idx: context.buffer.indexOf(TAGS.RESPONSE_START), type: "response" as const },
    { idx: context.buffer.indexOf(TAGS.COMMAND), type: "command" as const },
    { idx: context.buffer.indexOf(TAGS.WEB_SEARCH), type: "command" as const },
    { idx: context.buffer.indexOf(TAGS.DONE), type: "done" as const },
  ].filter((p) => p.idx !== -1);

  if (exitPoints.length === 0) {
    flushSafeContent(context, events, ParserEventType.THINKING_CONTENT);
    return;
  }

  const earliest = exitPoints.reduce((min, p) => (p.idx < min.idx ? p : min));

  if (earliest.idx > 0) {
    const content = context.buffer.slice(0, earliest.idx);
    emitContentEvent(events, ParserEventType.THINKING_CONTENT, content);
  }

  if (earliest.type === "end") {
    context.buffer = context.buffer.slice(earliest.idx + TAGS.THINKING_END.length);
  } else {
    context.buffer = context.buffer.slice(earliest.idx);
  }

  context.state = StreamState.TEXT;
  events.push({ type: ParserEventType.THINKING_END });
}

export function handleSandboxState(
  context: ParserContext,
  events: ParserEvent[],
): void {
  const signals: Array<{ idx: number; type: SandboxStateSignal }> = [
    { idx: context.buffer.indexOf(TAGS.FILE_START), type: "file" as const },
    {
      idx: context.buffer.indexOf(TAGS.SANDBOX_START),
      type: "sandbox_start" as const,
    },
    { idx: context.buffer.indexOf(TAGS.SANDBOX_END), type: "sandbox_end" as const },
    { idx: context.buffer.indexOf(TAGS.DONE), type: "done_start" as const },
  ].filter((signal) => signal.idx !== -1);

  if (signals.length === 0) {
    flushSandboxContent(context, events);
    return;
  }

  const earliest = signals.reduce((min, signal) =>
    signal.idx < min.idx ? signal : min,
  );

  if (earliest.type === "file") {
    processFileOpenTag(context, events, earliest.idx);
    return;
  }

  if (earliest.type === "sandbox_start") {
    const closeIdx = context.buffer.indexOf(">", earliest.idx);
    if (closeIdx === -1) {
      return;
    }
    context.buffer = context.buffer.slice(closeIdx + 1);
    return;
  }

  if (earliest.type === "sandbox_end") {
    context.buffer = context.buffer.slice(earliest.idx + TAGS.SANDBOX_END.length);
    context.state = StreamState.TEXT;
    events.push({ type: ParserEventType.SANDBOX_END });
    return;
  }

  // Recover from malformed outputs (e.g. missing </edward_sandbox>) by
  // implicitly closing sandbox before parsing <edward_done />.
  context.state = StreamState.TEXT;
  events.push({ type: ParserEventType.SANDBOX_END });
  handleTextState(context, events);
}

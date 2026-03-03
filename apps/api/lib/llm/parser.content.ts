import path from "path";
import {
  parseInstallDependencies,
} from "@edward/shared/llm/streamTagParser";
import {
  StreamState,
  type ParserEvent,
} from "../../schemas/chat.schema.js";
import { ParserEventType } from "@edward/shared/streamEvents";
import { NPM_PACKAGE_REGEX } from "../../utils/constants.js";
import type { AllowedFramework, ParserContext } from "./parser.shared.js";
import {
  LOOKAHEAD_LIMIT,
  TAGS,
  extractTagAttribute,
  stripDanglingControlCloseFragment,
} from "./parser.shared.js";

export function emitContentEvent(
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

export function flushSafeContent(
  context: ParserContext,
  events: ParserEvent[],
  type:
    | ParserEventType.TEXT
    | ParserEventType.THINKING_CONTENT
    | ParserEventType.FILE_CONTENT,
): void {
  const lastLt = context.buffer.lastIndexOf("<");

  if (lastLt !== -1 && context.buffer.length - lastLt < LOOKAHEAD_LIMIT) {
    if (lastLt > 0) {
      emitContentEvent(events, type, context.buffer.slice(0, lastLt));
      context.buffer = context.buffer.slice(lastLt);
    }
  } else if (context.buffer.length > 0) {
    emitContentEvent(events, type, context.buffer);
    context.buffer = "";
  }
}

export function flushSandboxContent(
  context: ParserContext,
  events: ParserEvent[],
): void {
  const lastLt = context.buffer.lastIndexOf("<");

  if (lastLt !== -1 && context.buffer.length - lastLt < LOOKAHEAD_LIMIT) {
    if (context.buffer.length > LOOKAHEAD_LIMIT && lastLt > 0) {
      const safeContent = context.buffer.slice(0, lastLt);
      if (safeContent.trim()) {
        emitContentEvent(events, ParserEventType.TEXT, safeContent);
      }
      context.buffer = context.buffer.slice(lastLt);
    }
  } else if (lastLt === -1 && context.buffer.length > LOOKAHEAD_LIMIT) {
    const safeContent = context.buffer;
    if (safeContent.trim()) {
      emitContentEvent(events, ParserEventType.TEXT, safeContent);
    }
    context.buffer = "";
  }
}

export function cleanFileContent(content: string): string {
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

export function parseInstallContent(content: string): {
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

export function processFileOpenTag(
  context: ParserContext,
  events: ParserEvent[],
  fileIdx: number,
): void {
  const closeIdx = context.buffer.indexOf(">", fileIdx);
  if (closeIdx === -1) return;

  if (fileIdx > 0) {
    const textContent = context.buffer.slice(0, fileIdx);
    if (textContent.trim()) {
      emitContentEvent(events, ParserEventType.TEXT, textContent);
    }
  }

  const tag = context.buffer.slice(fileIdx, closeIdx + 1);
  const rawPath = extractTagAttribute(tag, "path");

  if (!rawPath?.trim()) {
    events.push({
      type: ParserEventType.ERROR,
      message: "Invalid file tag: missing or empty path",
      code: "invalid_file_tag",
      severity: "recoverable",
    });
    context.buffer = context.buffer.slice(closeIdx + 1);
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
    context.buffer = context.buffer.slice(closeIdx + 1);
    return;
  }

  events.push({ type: ParserEventType.FILE_START, path: normalizedPath });
  context.buffer = context.buffer.slice(closeIdx + 1);
  context.state = StreamState.FILE;
}

export function processDoneTag(
  context: ParserContext,
  events: ParserEvent[],
): void {
  const closeIdx = context.buffer.indexOf(">");
  if (closeIdx === -1) return;

  events.push({ type: ParserEventType.DONE });
  context.buffer = context.buffer.slice(closeIdx + 1);
  context.state = StreamState.TEXT;
}

export function handleFileState(
  context: ParserContext,
  events: ParserEvent[],
): void {
  const endIdx = context.buffer.indexOf(TAGS.FILE_END);

  if (endIdx !== -1) {
    if (endIdx > 0) {
      let content = context.buffer.slice(0, endIdx);

      if (content) {
        content = cleanFileContent(content);
        emitContentEvent(events, ParserEventType.FILE_CONTENT, content);
      }
    }
    context.buffer = context.buffer.slice(endIdx + TAGS.FILE_END.length);
    context.state = StreamState.SANDBOX;
    events.push({ type: ParserEventType.FILE_END });
  } else {
    flushSafeContent(context, events, ParserEventType.FILE_CONTENT);
  }
}

export function handleInstallState(
  context: ParserContext,
  events: ParserEvent[],
): void {
  const endIdx = context.buffer.indexOf(TAGS.INSTALL_END);

  if (endIdx !== -1) {
    const content = context.buffer.slice(0, endIdx).trim();
    if (content) {
      const parsed = parseInstallContent(content);
      events.push({
        type: ParserEventType.INSTALL_CONTENT,
        dependencies: parsed.dependencies,
        framework: parsed.framework,
      });
    }
    context.buffer = context.buffer.slice(endIdx + TAGS.INSTALL_END.length);
    context.state = StreamState.TEXT;
    events.push({ type: ParserEventType.INSTALL_END });
  }
}

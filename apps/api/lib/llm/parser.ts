import path from "path";
import {
  StreamState,
  ParserEventType,
  type ParserEvent,
} from "../../schemas/chat.schema.js";
import { NPM_PACKAGE_REGEX } from "../../utils/sharedConstants.js";
import type { Framework } from "../../services/planning/schemas.js";

const TAGS = {
  THINKING_START: "<Thinking>",
  THINKING_END: "</Thinking>",
  SANDBOX_START: "<edward_sandbox",
  SANDBOX_END: "</edward_sandbox>",
  FILE_START: "<file",
  FILE_END: "</file>",
  INSTALL_START: "<edward_install>",
  INSTALL_END: "</edward_install>",
  COMMAND: "<edward_command",
  RESPONSE_START: "<Response>",
  DONE: "<edward_done",
} as const;

const LOOKAHEAD_LIMIT = 256;
const MAX_BUFFER_SIZE = 1024 * 10;
const MAX_ITERATIONS = 1000;

interface TagCandidate {
  idx: number;
  tag: string;
  state: StreamState;
  event: ParserEventType | null;
}

interface ExitPoint {
  idx: number;
  type: "end" | "sandbox" | "install" | "response" | "command" | "done";
}

type AllowedFramework = Framework | "next" | "react" | "vite" | "next.js";

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

  function handleTextState(events: ParserEvent[]): void {
    const candidates: TagCandidate[] = [
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
    ].filter((c) => c.idx !== -1);

    if (candidates.length === 0) {
      flushSafeContent(events, ParserEventType.TEXT);
      return;
    }

    const next = candidates.reduce((min, c) => (c.idx < min.idx ? c : min));

    if (next.idx > 0) {
      const textContent = buffer.slice(0, next.idx);
      if (textContent) {
        events.push({ type: ParserEventType.TEXT, content: textContent });
      }
    }
    buffer = buffer.slice(next.idx);

    if (buffer.startsWith(TAGS.THINKING_START)) {
      buffer = buffer.slice(TAGS.THINKING_START.length);
      state = StreamState.THINKING;
      events.push({ type: ParserEventType.THINKING_START });
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

      const commandMatch = tagContent.match(/command="([^"]+)"/);
      if (!commandMatch || !commandMatch[1]) {
        events.push({
          type: ParserEventType.ERROR,
          message: 'edward_command tag missing required "command" attribute',
        });
      } else {
        const command = commandMatch[1];
        let args: string[] = [];
        const argsMatch = tagContent.match(/args='([^']*)'/);
        if (argsMatch && argsMatch[1]) {
          try {
            args = JSON.parse(argsMatch[1]);
          } catch {
            /* malformed JSON — keep empty args */
          }
        }
        events.push({ type: ParserEventType.COMMAND, command, args });
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
      { idx: buffer.indexOf(TAGS.DONE), type: "done" as const },
    ].filter((p) => p.idx !== -1);

    if (exitPoints.length === 0) {
      flushSafeContent(events, ParserEventType.THINKING_CONTENT);
      return;
    }

    const earliest = exitPoints.reduce((min, p) => (p.idx < min.idx ? p : min));

    if (earliest.idx > 0) {
      const content = buffer.slice(0, earliest.idx);
      if (content) {
        events.push({ type: ParserEventType.THINKING_CONTENT, content });
      }
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
    const fileIdx = buffer.indexOf(TAGS.FILE_START);
    const endIdx = buffer.indexOf(TAGS.SANDBOX_END);

    if (fileIdx !== -1 && (endIdx === -1 || fileIdx < endIdx)) {
      processFileOpenTag(events, fileIdx);
    } else if (endIdx !== -1) {
      buffer = buffer.slice(endIdx + TAGS.SANDBOX_END.length);
      state = StreamState.TEXT;
      events.push({ type: ParserEventType.SANDBOX_END });
    } else {
      flushSandboxContent(events);
    }
  }

  function handleFileState(events: ParserEvent[]): void {
    const endIdx = buffer.indexOf(TAGS.FILE_END);

    if (endIdx !== -1) {
      if (endIdx > 0) {
        let content = buffer.slice(0, endIdx);

        if (content) {
          content = cleanFileContent(content);
          events.push({ type: ParserEventType.FILE_CONTENT, content });
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
    const projectMatch = tag.match(/project="([^"]*)"/)?.[1];
    const baseMatch = tag.match(/base="([^"]*)"/)?.[1];

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
        events.push({ type: ParserEventType.TEXT, content: textContent });
      }
    }

    const tag = buffer.slice(fileIdx, closeIdx + 1);
    const rawPath = tag.match(/path="([^"]*)"/)?.[1];

    if (!rawPath?.trim()) {
      events.push({
        type: ParserEventType.ERROR,
        message: "Invalid file tag: missing or empty path",
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
      });
      buffer = buffer.slice(closeIdx + 1);
      return;
    }

    events.push({ type: ParserEventType.FILE_START, path: normalizedPath });
    buffer = buffer.slice(closeIdx + 1);
    state = StreamState.FILE;
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
        events.push({ type, content: buffer.slice(0, lastLt) } as ParserEvent);
        buffer = buffer.slice(lastLt);
      }
    } else if (buffer.length > 0) {
      events.push({ type, content: buffer } as ParserEvent);
      buffer = "";
    }
  }

  function flushSandboxContent(events: ParserEvent[]): void {
    const lastLt = buffer.lastIndexOf("<");

    if (lastLt !== -1 && buffer.length - lastLt < LOOKAHEAD_LIMIT) {
      if (buffer.length > LOOKAHEAD_LIMIT && lastLt > 0) {
        const safeContent = buffer.slice(0, lastLt);
        if (safeContent.trim()) {
          events.push({ type: ParserEventType.TEXT, content: safeContent });
        }
        buffer = buffer.slice(lastLt);
      }
    } else if (lastLt === -1 && buffer.length > LOOKAHEAD_LIMIT) {
      const safeContent = buffer;
      if (safeContent.trim()) {
        events.push({ type: ParserEventType.TEXT, content: safeContent });
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
    const dependencies: string[] = [];
    let inPackagesList = false;

    for (const line of lines) {
      if (line.includes("<") || line.includes(">")) {
        continue;
      }

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
        inPackagesList = false;
        continue;
      }

      if (cleanLine.startsWith("packages:")) {
        const pkgs = cleanLine.replace("packages:", "").trim();
        if (pkgs) {
          dependencies.push(...parsePackageList(pkgs));
          inPackagesList = false;
        } else {
          inPackagesList = true;
        }
        continue;
      }

      if (isValidPackageName(cleanLine)) {
        dependencies.push(cleanLine);
      } else if (inPackagesList && cleanLine) {
        dependencies.push(...parsePackageList(cleanLine));
      }
    }

    return { dependencies, framework };
  }

  function parsePackageList(input: string): string[] {
    return input
      .split(",")
      .map((p) => p.trim())
      .filter(isValidPackageName);
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
          events.push({ type: ParserEventType.TEXT, content: buffer });
          break;

        case StreamState.THINKING:
          events.push(
            { type: ParserEventType.THINKING_CONTENT, content: buffer },
            { type: ParserEventType.THINKING_END },
          );
          break;

        case StreamState.FILE:
          events.push(
            { type: ParserEventType.FILE_CONTENT, content: buffer },
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

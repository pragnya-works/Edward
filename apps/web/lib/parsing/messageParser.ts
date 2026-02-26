import {
  ASSISTANT_STREAM_TAGS as TAGS,
  decodeHtmlAttribute,
  extractThinkingContentUntilExit,
  parseInstallDependencies,
} from "@edward/shared/llm/streamTagParser";

export enum MessageBlockType {
  THINKING = "thinking",
  FILE = "file",
  COMMAND = "command",
  WEB_SEARCH = "web_search",
  URL_SCRAPE = "url_scrape",
  INSTALL = "install",
  SANDBOX = "sandbox",
  DONE = "done",
  TEXT = "text",
}

enum MessageParseTokenType {
  THINKING = "thinking",
  FILE = "file",
  INSTALL = "install",
  COMMAND = "command",
  WEB_SEARCH = "web_search",
  URL_SCRAPE = "url_scrape",
  SANDBOX = "sandbox",
  SANDBOX_END = "sandbox_end",
  DONE = "done",
  RESPONSE = "response",
  RESPONSE_END = "response_end",
}

function extractTagAttribute(tag: string, attributeName: string): string | undefined {
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quotedPattern = new RegExp(
    `${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
  );
  const quotedMatch = tag.match(quotedPattern);
  if (quotedMatch) {
    return quotedMatch[1] ?? quotedMatch[2] ?? "";
  }

  const unquotedPattern = new RegExp(`${escapedName}\\s*=\\s*([^\\s>]+)`);
  const unquotedMatch = tag.match(unquotedPattern);
  return unquotedMatch?.[1];
}

function decodeBase64Utf8(value: string): string | null {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    if (typeof globalThis.atob !== "function") {
      return null;
    }
    const binary = globalThis.atob(normalized);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function decodeBase64Json<T>(value: string | undefined): T | undefined {
  if (!value) {
    return undefined;
  }

  const decoded = decodeBase64Utf8(value);
  if (!decoded) {
    return undefined;
  }

  try {
    return JSON.parse(decoded) as T;
  } catch {
    return undefined;
  }
}

export type MessageBlock =
  | { type: MessageBlockType.THINKING; content: string }
  | {
      type: MessageBlockType.FILE;
      path: string;
      content: string;
      isInternal?: boolean;
    }
  | { type: MessageBlockType.COMMAND; command: string; args: string[] }
  | {
      type: MessageBlockType.WEB_SEARCH;
      query: string;
      maxResults?: number;
      answer?: string;
      error?: string;
      results?: Array<{
        title: string;
        url: string;
        snippet: string;
      }>;
    }
  | {
      type: MessageBlockType.URL_SCRAPE;
      url: string;
      status: "success" | "error";
      title?: string;
      error?: string;
    }
  | { type: MessageBlockType.INSTALL; dependencies: string[] }
  | { type: MessageBlockType.SANDBOX; project?: string; base?: string }
  | { type: MessageBlockType.DONE }
  | { type: MessageBlockType.TEXT; content: string };

export function parseMessageContent(content: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let remaining = content;
  let inSandbox = false;
  let inResponse = false;

  const hasResponseTags = content.includes(TAGS.RESPONSE_START);

  while (remaining.length > 0) {
    const thinkingStart = remaining.indexOf(TAGS.THINKING_START);
    const fileStart = remaining.indexOf(TAGS.FILE_START);
    const installStart = remaining.indexOf(TAGS.INSTALL_START);
    const commandStart = remaining.indexOf(TAGS.COMMAND_START);
    const webSearchStart = remaining.indexOf(TAGS.WEB_SEARCH_START);
    const urlScrapeStart = remaining.indexOf(TAGS.URL_SCRAPE_START);
    const sandboxStart = remaining.indexOf(TAGS.SANDBOX_START);
    const sandboxEnd = remaining.indexOf(TAGS.SANDBOX_END);
    const doneStart = remaining.indexOf(TAGS.DONE_START);
    const responseStart = remaining.indexOf(TAGS.RESPONSE_START);
    const responseEnd = remaining.indexOf(TAGS.RESPONSE_END);

    const candidates = [
      { type: MessageParseTokenType.THINKING, idx: thinkingStart },
      { type: MessageParseTokenType.FILE, idx: fileStart },
      { type: MessageParseTokenType.INSTALL, idx: installStart },
      { type: MessageParseTokenType.COMMAND, idx: commandStart },
      { type: MessageParseTokenType.WEB_SEARCH, idx: webSearchStart },
      { type: MessageParseTokenType.URL_SCRAPE, idx: urlScrapeStart },
      { type: MessageParseTokenType.SANDBOX, idx: sandboxStart },
      { type: MessageParseTokenType.SANDBOX_END, idx: sandboxEnd },
      { type: MessageParseTokenType.DONE, idx: doneStart },
      { type: MessageParseTokenType.RESPONSE, idx: responseStart },
      { type: MessageParseTokenType.RESPONSE_END, idx: responseEnd },
    ].filter((i) => i.idx !== -1);

    if (candidates.length === 0) {
      if (!hasResponseTags || inResponse) {
        blocks.push({ type: MessageBlockType.TEXT, content: remaining });
      }
      break;
    }

    candidates.sort((a, b) => a.idx - b.idx);
    const earliest = candidates[0];
    if (!earliest) break;

    if (earliest.idx > 0) {
      const text = remaining.slice(0, earliest.idx);
      if (!hasResponseTags || inResponse) {
        blocks.push({ type: MessageBlockType.TEXT, content: text });
      }
    }

    remaining = remaining.slice(earliest.idx);

    if (earliest.type === MessageParseTokenType.THINKING) {
      const endIdx = remaining.indexOf(TAGS.THINKING_END);
      if (endIdx !== -1) {
        const thinkingContent = remaining
          .slice(TAGS.THINKING_START.length, endIdx)
          .trim();
        blocks.push({ type: MessageBlockType.THINKING, content: thinkingContent });
        remaining = remaining.slice(endIdx + TAGS.THINKING_END.length);
      } else {
        const fallbackThinking = extractThinkingContentUntilExit(remaining, TAGS);
        if (fallbackThinking.content) {
          blocks.push({
            type: MessageBlockType.THINKING,
            content: fallbackThinking.content,
          });
        }
        if (fallbackThinking.nextRemaining === null) {
          break;
        }
        remaining = fallbackThinking.nextRemaining;
      }
    } else if (earliest.type === MessageParseTokenType.FILE) {
      const closeTagIdx = remaining.indexOf(">");
      if (closeTagIdx !== -1) {
        const tag = remaining.slice(0, closeTagIdx + 1);
        const filePath = extractTagAttribute(tag, "path")?.trim() || "unknown";

        const endTagIdx = remaining.indexOf(TAGS.FILE_END);
        if (endTagIdx !== -1) {
          const fileContent = remaining
            .slice(closeTagIdx + 1, endTagIdx)
            .trim();
          blocks.push({
            type: MessageBlockType.FILE,
            path: filePath,
            content: fileContent,
            isInternal: inSandbox,
          });
          remaining = remaining.slice(endTagIdx + TAGS.FILE_END.length);
        } else {
          const fileContent = remaining.slice(closeTagIdx + 1).trim();
          blocks.push({
            type: MessageBlockType.FILE,
            path: filePath,
            content: fileContent,
            isInternal: inSandbox,
          });
          break;
        }
      } else {
        break;
      }
    } else if (earliest.type === MessageParseTokenType.INSTALL) {
      const endIdx = remaining.indexOf(TAGS.INSTALL_END);
      if (endIdx !== -1) {
        const installContent = remaining
          .slice(TAGS.INSTALL_START.length, endIdx)
          .trim();
        const dependencies = parseInstallDependencies(installContent);

        blocks.push({ type: MessageBlockType.INSTALL, dependencies });
        remaining = remaining.slice(endIdx + TAGS.INSTALL_END.length);
      } else {
        break;
      }
    } else if (earliest.type === MessageParseTokenType.COMMAND) {
      const closeTagIdx = remaining.indexOf(">");
      if (closeTagIdx !== -1) {
        const tag = remaining.slice(0, closeTagIdx + 1);
        const command = extractTagAttribute(tag, "command") ?? "";

        let args: string[] = [];
        const argsRaw = extractTagAttribute(tag, "args");
        if (argsRaw) {
          try {
            args = JSON.parse(argsRaw);
          } catch {
            args = [];
          }
        }

        blocks.push({ type: MessageBlockType.COMMAND, command, args });
        remaining = remaining.slice(closeTagIdx + 1);
      } else {
        break;
      }
    } else if (earliest.type === MessageParseTokenType.WEB_SEARCH) {
      const closeTagIdx = remaining.indexOf(">");
      if (closeTagIdx !== -1) {
        const tag = remaining.slice(0, closeTagIdx + 1);
        const query = decodeHtmlAttribute(extractTagAttribute(tag, "query") ?? "");
        const maxRaw =
          extractTagAttribute(tag, "max_results") ??
          extractTagAttribute(tag, "maxResults");
        const maxResults = maxRaw ? Number.parseInt(maxRaw, 10) : undefined;
        const answer = decodeBase64Json<string>(
          extractTagAttribute(tag, "answer_b64"),
        );
        const error = decodeBase64Json<string>(
          extractTagAttribute(tag, "error_b64"),
        );
        const results = decodeBase64Json<
          Array<{ title: string; url: string; snippet: string }>
        >(extractTagAttribute(tag, "results_b64"));

        blocks.push({
          type: MessageBlockType.WEB_SEARCH,
          query,
          maxResults,
          answer,
          error,
          results,
        });
        remaining = remaining.slice(closeTagIdx + 1);
      } else {
        break;
      }
    } else if (earliest.type === MessageParseTokenType.URL_SCRAPE) {
      const closeTagIdx = remaining.indexOf(">");
      if (closeTagIdx !== -1) {
        const tag = remaining.slice(0, closeTagIdx + 1);
        const url = decodeHtmlAttribute(extractTagAttribute(tag, "url") ?? "");
        const statusRaw = extractTagAttribute(tag, "status") ?? "";
        const status = statusRaw === "error" ? "error" : "success";
        const title = decodeHtmlAttribute(extractTagAttribute(tag, "title") ?? "");
        const error = decodeHtmlAttribute(extractTagAttribute(tag, "error") ?? "");

        if (url) {
          blocks.push({
            type: MessageBlockType.URL_SCRAPE,
            url,
            status,
            title: title || undefined,
            error: error || undefined,
          });
        }
        remaining = remaining.slice(closeTagIdx + 1);
      } else {
        break;
      }
    } else if (earliest.type === MessageParseTokenType.SANDBOX) {
      const closeTagIdx = remaining.indexOf(">");
      if (closeTagIdx !== -1) {
        const tag = remaining.slice(0, closeTagIdx + 1);

        blocks.push({
          type: MessageBlockType.SANDBOX,
          project: extractTagAttribute(tag, "project"),
          base: extractTagAttribute(tag, "base"),
        });
        inSandbox = true;
        remaining = remaining.slice(closeTagIdx + 1);
      } else {
        break;
      }
    } else if (earliest.type === MessageParseTokenType.SANDBOX_END) {
      inSandbox = false;
      remaining = remaining.slice(TAGS.SANDBOX_END.length);
    } else if (earliest.type === MessageParseTokenType.DONE) {
      const closeTagIdx = remaining.indexOf(">");
      if (closeTagIdx !== -1) {
        blocks.push({ type: MessageBlockType.DONE });
        remaining = remaining.slice(closeTagIdx + 1);
      } else {
        break;
      }
    } else if (earliest.type === MessageParseTokenType.RESPONSE) {
      inResponse = true;
      remaining = remaining.slice(TAGS.RESPONSE_START.length);
    } else if (earliest.type === MessageParseTokenType.RESPONSE_END) {
      inResponse = false;
      remaining = remaining.slice(TAGS.RESPONSE_END.length);
    }
  }

  return blocks.filter(
    (b) => b.type !== MessageBlockType.TEXT || b.content.trim().length > 0,
  );
}

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

const TAGS = {
  THINKING_START: "<Thinking>",
  THINKING_END: "</Thinking>",
  FILE_START: "<file",
  FILE_END: "</file>",
  INSTALL_START: "<edward_install>",
  INSTALL_END: "</edward_install>",
  COMMAND_START: "<edward_command",
  WEB_SEARCH_START: "<edward_web_search",
  URL_SCRAPE_START: "<edward_url_scrape",
  SANDBOX_START: "<edward_sandbox",
  SANDBOX_END: "</edward_sandbox>",
  DONE_START: "<edward_done",
  RESPONSE_START: "<Response>",
  RESPONSE_END: "</Response>",
} as const;

type MessageBlock =
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

function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

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
      // If we are in strictly tagged mode, only push if inResponse
      // Otherwise (legacy), push everything
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
        const nextResponse = remaining.indexOf(TAGS.RESPONSE_START);
        const nextFile = remaining.indexOf(TAGS.FILE_START);
        const nextInstall = remaining.indexOf("<edward_install");
        const nextSandbox = remaining.indexOf(TAGS.SANDBOX_START);
        const nextCommand = remaining.indexOf(TAGS.COMMAND_START);
        const nextWebSearch = remaining.indexOf(TAGS.WEB_SEARCH_START);
        const nextUrlScrape = remaining.indexOf(TAGS.URL_SCRAPE_START);
        const nextDone = remaining.indexOf(TAGS.DONE_START);

        const exitPoints = [
          nextResponse, nextFile, nextInstall,
          nextSandbox, nextCommand, nextWebSearch, nextUrlScrape, nextDone
        ].filter(idx => idx !== -1);

        if (exitPoints.length > 0) {
          const earliestExit = Math.min(...exitPoints);
          const thinkingContent = remaining
            .slice(TAGS.THINKING_START.length, earliestExit)
            .trim();
          if (thinkingContent) {
            blocks.push({ type: MessageBlockType.THINKING, content: thinkingContent });
          }
          remaining = remaining.slice(earliestExit);
        } else {
          // Partial thinking tag while streaming
          const thinkingContent = remaining.slice(TAGS.THINKING_START.length).trim();
          if (thinkingContent) {
            blocks.push({ type: MessageBlockType.THINKING, content: thinkingContent });
          }
          break;
        }
      }
    } else if (earliest.type === MessageParseTokenType.FILE) {
      const closeTagIdx = remaining.indexOf(">");
      if (closeTagIdx !== -1) {
        const tag = remaining.slice(0, closeTagIdx + 1);
        const pathMatch = tag.match(/path="([^"]*)"/);
        const filePath = pathMatch ? (pathMatch[1] ?? "unknown") : "unknown";

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
          // Partial file content while streaming
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
        const dependencies = installContent
          .split("\n")
          .map((l) => l.trim())
          .filter(
            (l) =>
              l && !l.startsWith("framework:") && !l.startsWith("packages:"),
          )
          .map((l) => l.replace(/^\s*[-*]\s*/, "").trim());

        blocks.push({ type: MessageBlockType.INSTALL, dependencies });
        remaining = remaining.slice(endIdx + TAGS.INSTALL_END.length);
      } else {
        break;
      }
    } else if (earliest.type === MessageParseTokenType.COMMAND) {
      const closeTagIdx = remaining.indexOf(">");
      if (closeTagIdx !== -1) {
        const tag = remaining.slice(0, closeTagIdx + 1);
        const commandMatch = tag.match(/command="([^"]*)"/);
        const command = commandMatch ? (commandMatch[1] ?? "") : "";

        let args: string[] = [];
        const argsMatch = tag.match(/args='([^']*)'/);
        if (argsMatch && argsMatch[1]) {
          try {
            args = JSON.parse(argsMatch[1]);
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
        const queryMatch = tag.match(/query="([^"]*)"/);
        const query = decodeHtmlAttribute(queryMatch ? (queryMatch[1] ?? "") : "");
        const maxResultsMatch = tag.match(/max_results="(\d+)"|maxResults="(\d+)"/);
        const maxRaw = maxResultsMatch?.[1] ?? maxResultsMatch?.[2];
        const maxResults = maxRaw ? Number.parseInt(maxRaw, 10) : undefined;

        blocks.push({ type: MessageBlockType.WEB_SEARCH, query, maxResults });
        remaining = remaining.slice(closeTagIdx + 1);
      } else {
        break;
      }
    } else if (earliest.type === MessageParseTokenType.URL_SCRAPE) {
      const closeTagIdx = remaining.indexOf(">");
      if (closeTagIdx !== -1) {
        const tag = remaining.slice(0, closeTagIdx + 1);
        const urlMatch = tag.match(/url="([^"]*)"/);
        const statusMatch = tag.match(/status="([^"]*)"/);
        const titleMatch = tag.match(/title="([^"]*)"/);
        const errorMatch = tag.match(/error="([^"]*)"/);
        const url = decodeHtmlAttribute(urlMatch ? (urlMatch[1] ?? "") : "");
        const statusRaw = statusMatch ? (statusMatch[1] ?? "") : "";
        const status = statusRaw === "error" ? "error" : "success";
        const title = decodeHtmlAttribute(titleMatch ? (titleMatch[1] ?? "") : "");
        const error = decodeHtmlAttribute(errorMatch ? (errorMatch[1] ?? "") : "");

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
        const projectMatch = tag.match(/project="([^"]*)"/);
        const baseMatch = tag.match(/base="([^"]*)"/);

        blocks.push({
          type: MessageBlockType.SANDBOX,
          project: projectMatch?.[1],
          base: baseMatch?.[1],
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

export interface StreamTagBoundaries {
  THINKING_START: string;
  THINKING_END: string;
  FILE_START: string;
  FILE_END: string;
  INSTALL_START: string;
  INSTALL_END: string;
  COMMAND_START: string;
  WEB_SEARCH_START: string;
  URL_SCRAPE_START: string;
  SANDBOX_START: string;
  SANDBOX_END: string;
  DONE_START: string;
  RESPONSE_START: string;
  RESPONSE_END: string;
}

export const ASSISTANT_STREAM_TAGS: StreamTagBoundaries = {
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
};

export function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export function extractThinkingContentUntilExit(
  remaining: string,
  tags: StreamTagBoundaries = ASSISTANT_STREAM_TAGS,
): {
  content: string;
  nextRemaining: string | null;
} {
  const exitPoints = [
    remaining.indexOf(tags.RESPONSE_START),
    remaining.indexOf(tags.FILE_START),
    remaining.indexOf(tags.INSTALL_START),
    remaining.indexOf(tags.SANDBOX_START),
    remaining.indexOf(tags.COMMAND_START),
    remaining.indexOf(tags.WEB_SEARCH_START),
    remaining.indexOf(tags.URL_SCRAPE_START),
    remaining.indexOf(tags.DONE_START),
  ].filter((idx) => idx !== -1);

  if (exitPoints.length > 0) {
    const earliestExit = Math.min(...exitPoints);
    return {
      content: remaining.slice(tags.THINKING_START.length, earliestExit).trim(),
      nextRemaining: remaining.slice(earliestExit),
    };
  }

  return {
    content: remaining.slice(tags.THINKING_START.length).trim(),
    nextRemaining: null,
  };
}

export function parseInstallDependencies(installContent: string): string[] {
  const dependencies: string[] = [];
  let inPackagesList = false;

  for (const rawLine of installContent.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("framework:")) {
      inPackagesList = false;
      continue;
    }

    if (line.startsWith("packages:")) {
      const inline = line
        .slice("packages:".length)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      dependencies.push(...inline);
      inPackagesList = inline.length === 0;
      continue;
    }

    const cleaned = line.replace(/^\s*[-*]\s*/, "").trim();
    if (!cleaned) continue;

    if (inPackagesList) {
      const listed = cleaned
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      dependencies.push(...listed);
      continue;
    }

    dependencies.push(cleaned);
  }

  return dependencies;
}

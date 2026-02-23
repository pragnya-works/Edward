interface ThinkingTagBoundaries {
  THINKING_START: string;
  RESPONSE_START: string;
  FILE_START: string;
  INSTALL_START: string;
  SANDBOX_START: string;
  COMMAND_START: string;
  WEB_SEARCH_START: string;
  URL_SCRAPE_START: string;
  DONE_START: string;
}

export function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export function extractThinkingContentUntilExit(
  remaining: string,
  tags: ThinkingTagBoundaries,
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

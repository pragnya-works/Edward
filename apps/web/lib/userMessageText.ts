const TRAILING_LINE_WHITESPACE_REGEX = /[ \t]+$/g;
const WINDOWS_NEWLINE_REGEX = /\r\n?/g;
const MAX_CONSECUTIVE_EMPTY_LINES = 1;

function isLineEmpty(line: string): boolean {
  return line.trim().length === 0;
}

export function normalizeUserMessageText(input: string): string {
  const unixNewlines = input.replace(WINDOWS_NEWLINE_REGEX, "\n");
  const trimmedEdgeWhitespace = unixNewlines.trim();

  if (!trimmedEdgeWhitespace) {
    return "";
  }

  const lines = trimmedEdgeWhitespace
    .split("\n")
    .map((line) => line.replace(TRAILING_LINE_WHITESPACE_REGEX, ""));

  const collapsedLines: string[] = [];
  let emptyLineStreak = 0;

  for (const line of lines) {
    if (!isLineEmpty(line)) {
      collapsedLines.push(line);
      emptyLineStreak = 0;
      continue;
    }

    if (emptyLineStreak >= MAX_CONSECUTIVE_EMPTY_LINES) {
      continue;
    }

    collapsedLines.push("");
    emptyLineStreak += 1;
  }

  return collapsedLines.join("\n");
}

export function isImageOnlyPlaceholderText(input: string): boolean {
  return normalizeUserMessageText(input).toLowerCase() === "[image message]";
}

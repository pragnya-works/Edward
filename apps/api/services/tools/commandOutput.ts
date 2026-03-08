import {
  MAX_TOOL_STDIO_CHARS,
} from "../../utils/constants.js";

const ANSI_ESCAPE_SEQUENCE_PATTERN = new RegExp(
  `[${String.fromCharCode(0x1b)}${String.fromCharCode(0x9b)}][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[a-zA-Z\\d]*)*)?${String.fromCharCode(0x07)})|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))`,
  "g",
);

export const NEVER_TRUNCATE_COMMANDS = new Set(["cat"]);

export const RAW_OUTPUT_COMMANDS = new Set([
  "head",
  "tail",
  "grep",
  "ls",
  "find",
  "wc",
  "pwd",
  "date",
]);

const MAX_SANITIZE_INPUT_CHARS = MAX_TOOL_STDIO_CHARS * 8;

export function truncateWithMarker(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }

  const marker = "\n...[truncated]";
  if (maxChars <= marker.length) {
    return marker.slice(0, Math.max(0, maxChars));
  }
  return `${content.slice(0, maxChars - marker.length)}${marker}`;
}

function collapseRepeatedLines(input: string, maxConsecutive = 3): string {
  const lines = input.split("\n");
  const compacted: string[] = [];

  for (let index = 0; index < lines.length;) {
    const currentLine = lines[index] ?? "";
    let runLength = 1;
    while (
      index + runLength < lines.length &&
      lines[index + runLength] === currentLine
    ) {
      runLength += 1;
    }

    if (runLength <= maxConsecutive) {
      for (let offset = 0; offset < runLength; offset += 1) {
        compacted.push(currentLine);
      }
    } else {
      for (let offset = 0; offset < maxConsecutive; offset += 1) {
        compacted.push(currentLine);
      }
      compacted.push(`...[line repeated ${runLength - maxConsecutive} more times]`);
    }

    index += runLength;
  }

  return compacted.join("\n");
}

export function stripAnsiOnly(content: string): string {
  if (!content) {
    return "";
  }
  return content.replace(ANSI_ESCAPE_SEQUENCE_PATTERN, "").replace(/\r\n?/g, "\n");
}

export function sanitizeCommandOutput(content: string): string {
  if (!content) {
    return "";
  }

  const bounded = truncateWithMarker(content, MAX_SANITIZE_INPUT_CHARS);
  const withoutAnsi = bounded.replace(ANSI_ESCAPE_SEQUENCE_PATTERN, "");
  const normalizedNewlines = withoutAnsi.replace(/\r\n?/g, "\n");
  return collapseRepeatedLines(normalizedNewlines).trimEnd();
}

export function dedupeStdStreams(
  stdout: string,
  stderr: string,
  exitCode: number,
): { stdout: string; stderr: string } {
  if (!stdout || !stderr) {
    return { stdout, stderr };
  }

  if (stdout === stderr) {
    return exitCode === 0 ? { stdout, stderr: "" } : { stdout: "", stderr };
  }

  if (stdout.length >= 120 && stderr.includes(stdout)) {
    return exitCode === 0 ? { stdout, stderr: "" } : { stdout: "", stderr };
  }

  if (stderr.length >= 120 && stdout.includes(stderr)) {
    return exitCode === 0 ? { stdout, stderr: "" } : { stdout: "", stderr };
  }

  return { stdout, stderr };
}

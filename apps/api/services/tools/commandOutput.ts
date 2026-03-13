const ANSI_ESCAPE_SEQUENCE_PATTERN = new RegExp(
  `[${String.fromCharCode(0x1b)}${String.fromCharCode(0x9b)}][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[a-zA-Z\\d]*)*)?${String.fromCharCode(0x07)})|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))`,
  "g",
);

function stripAnsiAndNormalizeNewlines(content: string): string {
  return content.replace(ANSI_ESCAPE_SEQUENCE_PATTERN, "").replace(/\r\n?/g, "\n");
}

export function stripAnsiOnly(content: string): string {
  if (!content) {
    return "";
  }
  return stripAnsiAndNormalizeNewlines(content);
}

export function sanitizeCommandOutput(content: string): string {
  if (!content) {
    return "";
  }

  return stripAnsiAndNormalizeNewlines(content).trimEnd();
}

export function dedupeStdStreams(
  stdout: string,
  stderr: string,
): { stdout: string; stderr: string } {
  return { stdout, stderr };
}

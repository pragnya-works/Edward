const ANSI_ESCAPE_SEQUENCE_PATTERN = new RegExp(
  `[${String.fromCharCode(0x1b)}${String.fromCharCode(0x9b)}][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[a-zA-Z\\d]*)*)?${String.fromCharCode(0x07)})|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))`,
  "g"
);

export function sanitizeTerminalOutput(value: string | undefined): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }

  const withoutAnsi = value.replace(ANSI_ESCAPE_SEQUENCE_PATTERN, "");
  const normalized = withoutAnsi.replace(/\r\n?/g, "\n");
  return normalized.trimEnd();
}

const ANSI_ESCAPE_SEQUENCE_PATTERN = new RegExp(
  `[${String.fromCharCode(0x1b)}${String.fromCharCode(0x9b)}][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[a-zA-Z\\d]*)*)?${String.fromCharCode(0x07)})|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))`,
  "g"
);

function collapseRepeatedLines(input: string, maxConsecutive = 3): string {
  const lines = input.split("\n");
  const result: string[] = [];

  for (let index = 0; index < lines.length;) {
    const current = lines[index] ?? "";
    let runLength = 1;

    while (index + runLength < lines.length && lines[index + runLength] === current) {
      runLength += 1;
    }

    if (runLength <= maxConsecutive) {
      for (let offset = 0; offset < runLength; offset += 1) {
        result.push(current);
      }
    } else {
      for (let offset = 0; offset < maxConsecutive; offset += 1) {
        result.push(current);
      }
      result.push(`...[line repeated ${runLength - maxConsecutive} more times]`);
    }

    index += runLength;
  }

  return result.join("\n");
}

export function sanitizeTerminalOutput(value: string | undefined): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }

  const withoutAnsi = value.replace(ANSI_ESCAPE_SEQUENCE_PATTERN, "");
  const normalized = withoutAnsi.replace(/\r\n?/g, "\n");
  return collapseRepeatedLines(normalized).trimEnd();
}

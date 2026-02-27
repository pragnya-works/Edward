import type {
  AgentToolResult,
  CommandResult,
  WebSearchToolResult,
} from "@edward/shared/streamToolResults";
const ANSI_ESCAPE_SEQUENCE_PATTERN = new RegExp(
  `[${String.fromCharCode(0x1b)}${String.fromCharCode(0x9b)}][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[a-zA-Z\\d]*)*)?${String.fromCharCode(0x07)})|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))`,
  "g"
);

function sanitizeToolText(value: string): string {
  if (!value) {
    return "";
  }
  return value.replace(ANSI_ESCAPE_SEQUENCE_PATTERN, "").replace(/\r\n?/g, "\n").trimEnd();
}

export function formatCommandResults(results: CommandResult[]): string {
  return results
    .map((result) => {
      const stdout = sanitizeToolText(result.stdout);
      const stderr = sanitizeToolText(result.stderr);
      let output = `$ ${result.command} ${result.args.join(" ")}\n${stdout}`;
      if (stderr) output += `\nSTDERR: ${stderr}`;
      return output;
    })
    .join("\n---\n");
}

function formatWebSearchResult(result: WebSearchToolResult): string {
  if (result.error) {
    return `[web_search] query="${result.query}"\nERROR: ${result.error}`;
  }

  const lines: string[] = [`[web_search] query="${result.query}"`];
  if (result.answer) {
    lines.push(`Answer: ${result.answer}`);
  }
  if (result.results.length > 0) {
    lines.push("Sources:");
    for (const item of result.results) {
      lines.push(`- ${item.title} (${item.url})`);
      if (item.snippet) {
        lines.push(`  ${item.snippet}`);
      }
    }
  }
  return lines.join("\n");
}

export function formatToolResults(results: AgentToolResult[]): string {
  return results
    .map((result) => {
      if (result.tool === "command") {
        return formatCommandResults([result]);
      }
      return formatWebSearchResult(result);
    })
    .join("\n---\n");
}

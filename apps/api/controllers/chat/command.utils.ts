import type { WebSearchResultItem } from "@edward/shared/stream-events";

export interface CommandResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
}

export interface WebSearchResult {
  query: string;
  answer?: string;
  results: WebSearchResultItem[];
  error?: string;
}

export interface CommandToolResult extends CommandResult {
  tool: "command";
}

export interface WebSearchToolResult extends WebSearchResult {
  tool: "web_search";
}

export type AgentToolResult = CommandToolResult | WebSearchToolResult;

export function formatCommandResults(results: CommandResult[]): string {
  return results
    .map((result) => {
      let output = `$ ${result.command} ${result.args.join(" ")}\n${result.stdout}`;
      if (result.stderr) output += `\nSTDERR: ${result.stderr}`;
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

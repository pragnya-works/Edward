import type { WebSearchResultItem } from "./streamEvents.js";

export interface CommandResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
}

export interface WebSearchResult {
  query: string;
  maxResults?: number;
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

import { describe, expect, it } from "vitest";
import {
  ASSISTANT_STREAM_TAGS,
  decodeHtmlAttribute,
  extractThinkingContentUntilExit,
  parseInstallDependencies,
} from "../../src/llm/streamTagParser";

describe("streamTagParser", () => {
  it("decodes escaped html attributes", () => {
    expect(decodeHtmlAttribute("&quot;a&amp;b&lt;c&gt;")).toBe('"a&b<c>');
  });

  it("extracts thinking content until earliest structural tag", () => {
    const content =
      "<Thinking>Reasoning text<edward_command command=\"ls\" args='[]'>";
    const result = extractThinkingContentUntilExit(content, ASSISTANT_STREAM_TAGS);
    expect(result.content).toBe("Reasoning text");
    expect(result.nextRemaining).toBe("<edward_command command=\"ls\" args='[]'>");
  });

  it("parses install dependencies from inline and list sections", () => {
    const installContent = [
      "framework: nextjs",
      "packages: react, next",
      "- tailwindcss",
      "- @types/node",
    ].join("\n");

    expect(parseInstallDependencies(installContent)).toEqual([
      "react",
      "next",
      "tailwindcss",
      "@types/node",
    ]);
  });
});

import { describe, it, expect } from "vitest";

import {
  formatCommandResults,
  formatToolResults,
} from "../../../controllers/chat/command.utils.js";

describe("Agent loop command helpers", () => {
  it("formatCommandResults produces readable output", () => {
    const output = formatCommandResults([
      { command: "cat", args: ["a.ts"], stdout: "hello", stderr: "" },
      { command: "ls", args: ["-la"], stdout: "total 8", stderr: "warn" },
    ]);

    expect(output).toContain("$ cat a.ts");
    expect(output).toContain("hello");
    expect(output).toContain("STDERR: warn");
    expect(output).not.toContain("STDERR: \n");
  });

  it("formatToolResults includes web search details", () => {
    const output = formatToolResults([
      {
        tool: "web_search",
        query: "react docs",
        answer: "Official docs",
        results: [
          {
            title: "React",
            url: "https://react.dev",
            snippet: "Learn React",
          },
        ],
      },
    ]);

    expect(output).toContain("[web_search] query=\"react docs\"");
    expect(output).toContain("Answer: Official docs");
    expect(output).toContain("https://react.dev");
  });
});

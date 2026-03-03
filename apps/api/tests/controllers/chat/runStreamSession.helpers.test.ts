import { describe, expect, it } from "vitest";
import { AgentLoopStopReason } from "@edward/shared/streamEvents";
import { createStoredAssistantContent } from "../../../services/chat/session/orchestrator/runStreamSession.content.js";

describe("createStoredAssistantContent", () => {
  it("strips only known no-op closing control tags from stored assistant content", () => {
    const result = createStoredAssistantContent(
      "Before</edward_web_search>\nAfter</edward_command>\nTail</edward_future_tool>",
      "",
      [],
      AgentLoopStopReason.DONE,
    );

    expect(result).toContain("Before");
    expect(result).toContain("After");
    expect(result).not.toContain("</edward_web_search>");
    expect(result).not.toContain("</edward_command>");
    expect(result).toContain("</edward_future_tool>");
  });

  it("preserves structural close tags required for parser continuity", () => {
    const result = createStoredAssistantContent(
      "<edward_install>framework: vite</edward_install>\n<edward_sandbox><file path=\"src/main.ts\">console.log(1);</file></edward_sandbox>",
      "",
      [],
      AgentLoopStopReason.DONE,
    );

    expect(result).toContain("</edward_install>");
    expect(result).toContain("</edward_sandbox>");
  });

  it("removes lingering closing web-search tags after payload enrichment", () => {
    const result = createStoredAssistantContent(
      '<edward_web_search query="react docs"></edward_web_search>\nsummary',
      "",
      [
        {
          tool: "web_search",
          query: "react docs",
          maxResults: 5,
          answer: "Official docs",
          results: [],
        },
      ],
      AgentLoopStopReason.DONE,
    );

    expect(result).toContain('<edward_web_search query="react docs"');
    expect(result).not.toContain("</edward_web_search>");
  });
});

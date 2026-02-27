import { describe, expect, it } from "vitest";
import { buildAgentContinuationPrompt } from "../../../controllers/chat/session/shared/continuation.js";

describe("buildAgentContinuationPrompt", () => {
  it("preserves compact emitted file context for continuation turns", () => {
    const turnRawResponse = `
<Thinking>Plan</Thinking>
<Response>
<edward_sandbox project="demo" base="node">
<file path="src/App.tsx">
export default function App() {
  return <main>Hello</main>;
}
</file>
<file path="src/index.css">
body { margin: 0; }
</file>
</edward_sandbox>
<edward_done />
</Response>`;

    const result = buildAgentContinuationPrompt(
      "build me a clone",
      turnRawResponse,
      [
        {
          tool: "command",
          command: "npm",
          args: ["run", "build"],
          stdout: "",
          stderr: "Build failed at src/App.tsx:1",
        },
      ],
    );

    expect(result.prompt).toContain("FILES ALREADY EMITTED:");
    expect(result.prompt).toContain("src/App.tsx");
    expect(result.prompt).toContain("src/index.css");
    expect(result.prompt).toContain("Build failed at src/App.tsx:1");
  });

  it("still provides fallback narrative when no files were emitted", () => {
    const result = buildAgentContinuationPrompt(
      "search docs",
      "<Thinking>Searching</Thinking><Response><edward_web_search query=\"react docs\" max_results=\"5\" /></Response>",
      [
        {
          tool: "web_search",
          query: "react docs",
          answer: "Use the official docs.",
          results: [],
        },
      ],
    );

    expect(result.prompt).not.toContain("FILES ALREADY EMITTED:");
    expect(result.prompt).toContain("Use the official docs.");
  });

  it("bounds file-context payload for large multi-file responses", () => {
    const repeatedFiles = Array.from({ length: 40 }, (_, index) => `
<file path="src/file-${index}.ts">
${"x".repeat(2_000)}
</file>`).join("\n");

    const result = buildAgentContinuationPrompt(
      "continue",
      `<Response><edward_sandbox project="big" base="node">${repeatedFiles}</edward_sandbox><edward_done /></Response>`,
      [],
    );

    expect(result.prompt).toContain("FILES ALREADY EMITTED:");
    expect(result.prompt).toContain("...[additional files omitted]");
    expect(result.prompt.length).toBeLessThan(18_000);
  });
});

import { describe, expect, it } from "vitest";
import { hasCodeOutputInTurn } from "../../../controllers/chat/session/loop/internal/agentLoop.runner.js";

describe("agent loop continuation policy", () => {
  it("treats sandbox/file output as terminal", () => {
    const raw = `
<Thinking>Plan</Thinking>
<Response>
<edward_sandbox project="demo" base="node">
<file path="src/App.tsx">export default function App(){return null;}</file>
</edward_sandbox>
<edward_done />
</Response>`;

    expect(hasCodeOutputInTurn(raw)).toBe(true);
  });

  it("does not treat response narrative as terminal without files", () => {
    const raw = `
<Thinking>Plan</Thinking>
<Response>
I found 5 sources and will now implement the clone.
<edward_web_search query="x" max_results="5" />
</Response>`;

    expect(hasCodeOutputInTurn(raw)).toBe(false);
  });

  it("does not treat tool-only response as terminal", () => {
    const raw = `
<Thinking>Searching</Thinking>
<Response>
<edward_web_search query="react docs" max_results="5" />
</Response>`;

    expect(hasCodeOutputInTurn(raw)).toBe(false);
  });
});

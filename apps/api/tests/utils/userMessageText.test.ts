import { describe, expect, it } from "vitest";
import { normalizeUserMessageText } from "../../utils/userMessageText.js";

describe("normalizeUserMessageText", () => {
  it("trims edge whitespace and normalizes line endings", () => {
    const input = "\r\n  build a snake game in vite  \r\n\r\n";
    expect(normalizeUserMessageText(input)).toBe("build a snake game in vite");
  });

  it("collapses excessive empty lines inside user text", () => {
    const input = "line 1\n\n\n\nline 2";
    expect(normalizeUserMessageText(input)).toBe("line 1\n\nline 2");
  });

  it("preserves meaningful multiline content", () => {
    const input = "Step 1:\nInstall deps\n\nStep 2:\nRun dev server";
    expect(normalizeUserMessageText(input)).toBe(input);
  });
});

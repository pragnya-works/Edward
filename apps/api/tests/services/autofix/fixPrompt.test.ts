import { describe, it, expect } from "vitest";
import { extractFileFromResponse } from "../../../services/autofix/fixPrompt.js";

describe("extractFileFromResponse", () => {
    it("should extract a single file with simple markdown blocks", () => {
        const response = "FILE: src/index.ts\n```typescript\nconst x = 1;\nconsole.log(x);\n```";
        const files = extractFileFromResponse(response);
        expect(files.get("src/index.ts")).toBe("const x = 1;\nconsole.log(x);");
    });

    it("should handle mixed case FILE prefix", () => {
        const response = "Path: src/test.ts\n```\ncontent\n```";
        const files = extractFileFromResponse(response);
        expect(files.get("src/test.ts")).toBe("content");
    });

    it("should NOT corrupt files when response has multiple markdown blocks", () => {
        const response = [
            "FILE: file1.ts",
            "```typescript",
            "block 1",
            "```",
            "",
            "FILE: file2.ts",
            "```typescript",
            "block 2",
            "```"
        ].join("\n");
        const files = extractFileFromResponse(response);
        expect(files.get("file1.ts")).toBe("block 1");
        expect(files.get("file2.ts")).toBe("block 2");
    });

    it("should correctly handle closing fences used as text (before fix this would fail)", () => {
        const response = [
            "FILE: buggy.ts",
            "```typescript",
            "function test() {",
            "  console.log(\"end of block\");",
            "}",
            "```",
            "This text should NOT be in the file."
        ].join("\n");
        const files = extractFileFromResponse(response);
        expect(files.get("buggy.ts")).toBe("function test() {\n  console.log(\"end of block\");\n}");
        expect(files.size).toBe(1);
    });

    it("should handle triple backticks inside content if they are not on their own line", () => {
        const response = [
            "FILE: edge.ts",
            "```typescript",
            "const code = '```';",
            "```"
        ].join("\n");
        const files = extractFileFromResponse(response);
        expect(files.get("edge.ts")).toBe("const code = '```';");
    });
});

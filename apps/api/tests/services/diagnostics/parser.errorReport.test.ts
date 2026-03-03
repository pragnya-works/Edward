import { describe, expect, it } from "vitest";
import {
  categorizeError,
  detectStage,
  extractTarget,
  parseErrors,
} from "../../../services/diagnostics/parser.js";
import { createErrorReport } from "../../../services/diagnostics/errorReport.js";

describe("diagnostics parser and report", () => {
  it("parses compiler, runtime, and module errors with stable ordering", () => {
    const output = [
      "tsc --noEmit",
      "src/App.tsx(12,5): error TS2304: Cannot find name 'foo'",
      "Error: Cannot find module 'left-pad'",
      "  at src/main.ts:40:7",
    ].join("\n");

    const parsed = parseErrors(output);

    expect(parsed.length).toBeGreaterThanOrEqual(2);
    expect(parsed[0]).toMatchObject({
      file: "src/App.tsx",
      line: 12,
      column: 5,
      severity: "error",
      stage: "typecheck",
    });

    expect(parsed.some((entry) => entry.file === "unknown" && entry.line === 0)).toBe(
      true,
    );
  });

  it("categorizes error types and extracts useful targets", () => {
    expect(detectStage("vite transform failed")).toBe("transform");
    expect(categorizeError("Cannot find module 'react'")).toEqual({
      type: "missing_import",
      severity: "error",
    });
    expect(categorizeError("Cannot find name 'foo'", "TS2304")).toEqual({
      type: "type_mismatch",
      severity: "error",
    });
    expect(categorizeError("deprecated API warning")).toEqual({
      type: "unknown",
      severity: "warning",
    });
    expect(extractTarget("missing_import", "Cannot find module 'zod'")).toBe("zod");
    expect(
      extractTarget("type_mismatch", "Property 'theme' does not exist on type AppConfig"),
    ).toBe("theme");
  });

  it("builds a report from snapshot files without requiring container reads", async () => {
    const rawOutput = [
      "src/App.tsx(5,12): error TS2304: Cannot find name 'missingValue'",
      "Error: Cannot find module 'left-pad'",
    ].join("\n");

    const report = await createErrorReport("ctr-1", rawOutput, "nextjs", "pnpm build", {
      fileContents: new Map<string, string>([
        [
          "src/App.tsx",
          [
            "import { readFile } from 'left-pad';",
            "",
            "export function App() {",
            "  return <div>{missingValue}</div>;",
            "}",
          ].join("\n"),
        ],
        [
          "package.json",
          JSON.stringify({ name: "diagnostics-test", dependencies: { react: "^19.0.0" } }),
        ],
        ["tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } })],
      ]),
    });

    expect(report.failed).toBe(true);
    expect(report.summary.totalErrors).toBeGreaterThan(0);
    expect(report.summary.uniqueTypes).toContain("type_mismatch");
    const sourceError = report.errors.find((entry) => entry.error.file === "src/App.tsx");
    expect(sourceError).toBeDefined();
    expect(sourceError?.error.snippet).toContain(">   5 |");
    expect(report.userFacing?.pinpoint.file).toBeTruthy();
    expect(report.userFacing?.probableCause.length).toBeGreaterThan(0);
  });

  it("compresses very large raw output into a bounded payload", async () => {
    const oversized = `${"x".repeat(9_000)}\n${"y".repeat(9_000)}`;
    const report = await createErrorReport("ctr-2", oversized);

    expect(report.rawOutput.length).toBeLessThan(10_000);
    expect(report.rawOutput).toContain("... (output truncated) ...");
  });
});

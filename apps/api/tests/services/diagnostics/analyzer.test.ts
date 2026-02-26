import { describe, expect, it } from "vitest";
import {
  buildUserFacingDiagnosis,
  formatErrorForLLM,
} from "../../../services/diagnostics/analyzer.js";
import type { BuildError, BuildErrorReport } from "../../../services/diagnostics/types.js";

type BuildErrorOverrides = Omit<Partial<BuildError>, "error"> & {
  error?: Partial<BuildError["error"]>;
};

function makeError(overrides: BuildErrorOverrides = {}): BuildError {
  const base: BuildError = {
    id: "src/App.tsx:10:Cannot find name",
    headline: "type_mismatch error in src/App.tsx",
    type: "type_mismatch",
    severity: "error",
    stage: "typecheck",
    confidence: 92,
    error: {
      file: "src/App.tsx",
      line: 10,
      column: 5,
      message: "Cannot find name 'foo'",
      code: "TS2304",
      snippet: "return <div>{foo}</div>",
      target: "foo",
    },
    context: {},
    relatedErrors: [],
    relatedFiles: [],
    suggestion: "Define or import 'foo' before using it.",
    timestamp: new Date().toISOString(),
  };

  return {
    ...base,
    ...overrides,
    error: {
      ...base.error,
      ...(overrides.error ?? {}),
    },
  };
}

function makeReport(overrides: Partial<BuildErrorReport> = {}): BuildErrorReport {
  const rootCause = makeError();
  const base: BuildErrorReport = {
    failed: true,
    headline: "Build failed: type_mismatch - Cannot find name 'foo'",
    summary: {
      totalErrors: 1,
      criticalCount: 0,
      errorCount: 1,
      warningCount: 0,
      uniqueTypes: ["type_mismatch"],
      stage: "typecheck",
    },
    errors: [rootCause],
    rootCause,
    framework: "nextjs",
    command: "pnpm run build",
    rawOutput: "raw build logs",
    processedAt: new Date().toISOString(),
    duration: 15,
  };

  return {
    ...base,
    ...overrides,
  };
}

describe("diagnostics analyzer", () => {
  it("builds a user-facing diagnosis with explicit pinpoint", () => {
    const report = makeReport();
    const diagnosis = buildUserFacingDiagnosis(report);

    expect(diagnosis.shortMessage).toContain("Define or import");
    expect(diagnosis.pinpoint.file).toBe("src/App.tsx");
    expect(diagnosis.pinpoint.line).toBe(10);
    expect(diagnosis.pinpoint.code).toBe("TS2304");
    expect(diagnosis.pinpointContext).toContain("src/App.tsx:10:5");
    expect(diagnosis.preciseFix).toContain("src/App.tsx:10");
  });

  it("surfaces Node/Vite compatibility guidance for Vite internal runtime failures", () => {
    const viteRuntimeRoot = makeError({
      type: "runtime",
      stage: "runtime",
      suggestion: "The build failed in Vite internals.",
      error: {
        file: "/home/node/edward/node_modules/.pnpm/vite@7.3.1/node_modules/vite/dist/node/chunks/config.js",
        line: 23974,
        column: 30,
        message: "TypeError: crypto.hash is not a function",
        code: undefined,
      },
    });

    const report = makeReport({
      summary: {
        totalErrors: 1,
        criticalCount: 0,
        errorCount: 1,
        warningCount: 0,
        uniqueTypes: ["runtime"],
        stage: "runtime",
      },
      errors: [viteRuntimeRoot],
      rootCause: viteRuntimeRoot,
    });

    const diagnosis = buildUserFacingDiagnosis(report);

    expect(diagnosis.probableCause).toContain("Node.js runtime");
    expect(diagnosis.preciseFix).toContain("Do not edit node_modules");
    expect(diagnosis.preciseFix).toContain("Node.js 20.19+");
  });

  it("surfaces canonical/asset URL guidance for Vite build-html EISDIR failures", () => {
    const viteEisdirRoot = makeError({
      type: "config",
      stage: "bundle",
      suggestion: "Build failed in vite:build-html.",
      error: {
        file: "/home/node/edward/node_modules/.pnpm/vite@5.4.21/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js",
        line: 35357,
        column: 48,
        message: "EISDIR: illegal operation on a directory, read",
        code: undefined,
      },
    });

    const report = makeReport({
      summary: {
        totalErrors: 1,
        criticalCount: 0,
        errorCount: 1,
        warningCount: 0,
        uniqueTypes: ["config"],
        stage: "bundle",
      },
      errors: [viteEisdirRoot],
      rootCause: viteEisdirRoot,
    });

    const diagnosis = buildUserFacingDiagnosis(report);

    expect(diagnosis.probableCause).toContain("asset URL points to a directory");
    expect(diagnosis.preciseFix).toContain("index.html");
    expect(diagnosis.preciseFix).toContain("absolute http(s) URLs");
  });

  it("keeps LLM context compact for high-confidence known errors", () => {
    const report = makeReport({
      rawOutput: "VERBOSE RAW LOGS SHOULD NOT BE INCLUDED FOR CLEAN CASES",
    });

    const formatted = formatErrorForLLM(report);

    expect(formatted).toContain("SIMPLIFIED DIAGNOSIS:");
    expect(formatted).toContain("Pinpoint: src/App.tsx:10:5");
    expect(formatted).toContain("Pinpoint Context:");
    expect(formatted).toContain("Precise Fix:");
    expect(formatted).not.toContain("RAW BUILD OUTPUT (excerpt):");
  });

  it("includes raw output for low-confidence unknown errors", () => {
    const unknownRoot = makeError({
      type: "unknown",
      confidence: 40,
      suggestion: undefined,
      error: {
        message: "Unhandled build failure",
      },
    });
    const report = makeReport({
      summary: {
        totalErrors: 1,
        criticalCount: 0,
        errorCount: 1,
        warningCount: 0,
        uniqueTypes: ["unknown"],
        stage: "unknown",
      },
      errors: [unknownRoot],
      rootCause: unknownRoot,
      rawOutput: "FULL RAW LOGS",
    });

    const formatted = formatErrorForLLM(report);
    expect(formatted).toContain("RAW BUILD OUTPUT (excerpt):");
    expect(formatted).toContain("FULL RAW LOGS");
  });

  it("limits detailed error entries to avoid token bloat", () => {
    const errorA = makeError({ id: "a", error: { line: 10 } });
    const errorB = makeError({ id: "b", error: { line: 11 } });
    const errorC = makeError({ id: "c", error: { line: 12 } });

    const report = makeReport({
      summary: {
        totalErrors: 3,
        criticalCount: 0,
        errorCount: 3,
        warningCount: 0,
        uniqueTypes: ["type_mismatch"],
        stage: "typecheck",
      },
      errors: [errorA, errorB, errorC],
      rootCause: errorA,
    });

    const formatted = formatErrorForLLM(report);
    const detailedEntries = (formatted.match(/Error \[/g) || []).length;

    expect(detailedEntries).toBe(2);
    expect(formatted).toContain("... and 1 more errors");
  });
});

import type { BuildError, BuildErrorReport } from "./types.js";
import { buildDiagnosisGuidance } from "./analyzer.guidance.js";

export function findRootCause(errors: BuildError[]): BuildError | undefined {
  if (errors.length === 0) return undefined;

  const critical = errors.find((e) => e.severity === "critical");
  if (critical) return critical;

  const missingImports = errors.filter((e) => e.type === "missing_import");
  if (missingImports.length > 0) {
    return missingImports.reduce((oldest, current) =>
      oldest.confidence > current.confidence ? oldest : current,
    );
  }

  const syntaxErrors = errors.filter((e) => e.type === "syntax");
  if (syntaxErrors.length > 0) {
    return syntaxErrors.reduce((oldest, current) =>
      oldest.error.line < current.error.line ? oldest : current,
    );
  }

  return errors.reduce((best, current) =>
    best.confidence > current.confidence ? best : current,
  );
}

export function groupRelatedErrors(errors: BuildError[]): BuildError[] {
  const groups = new Map<string, BuildError[]>();

  for (const error of errors) {
    const key = `${error.type}:${error.error.target || ""}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    const group = groups.get(key);
    if (group) {
      group.push(error);
    }
  }

  for (const [, group] of groups) {
    if (group.length > 1) {
      const representative = group[0]!;
      for (let i = 1; i < group.length; i++) {
        const related = group[i];
        if (related) {
          related.relatedErrors.push(representative.id);
          representative.relatedErrors.push(related.id);
        }
      }
    }
  }

  return errors;
}

interface DiagnosticContext {
  packageJson?: Record<string, unknown>;
}

interface DiagnosticStrategy {
  layman: (error: BuildError, context: DiagnosticContext) => string;
}

const MAX_RAW_OUTPUT_FOR_LLM = 2500;
const MAX_ERRORS_FOR_LLM = 2;

const DIAGNOSTIC_STRATEGIES: Record<string, DiagnosticStrategy> = {
  missing_import: {
    layman: (err) => {
      const target = err.error.target || "something";
      return `I can't find '${target}'. It looks like a plugin or package is missing in the project. Install '${target.split("/")[0]}' in the sandbox and continue the fix flow.`;
    },
  },
  type_mismatch: {
    layman: (err) => {
      if (err.error.code === "TS2554")
        return "A function call is missing required arguments. Update the call signature at the pinpointed location.";
      if (err.error.code === "TS2786")
        return "A component is not recognized as a valid React component. Fix the import/source file typing at the pinpointed location.";
      const target = err.error.target;
      return target
        ? `It looks like '${target}' is being used incorrectly or has a typo in its definition.`
        : "There's a mismatch in how data is being used here. Align the types at the reported location.";
    },
  },
  syntax: {
    layman: (err) =>
      `There's a syntax typo in '${err.error.file}' on line ${err.error.line}. Fix the misplaced bracket, semicolon, or symbol at that line.`,
  },
  config: {
    layman: (err) => {
      const msg = err.error.message.toLowerCase();
      if (msg.includes("eslint") && msg.includes("next.config")) {
        return "Your Next.js configuration is using an outdated 'eslint' key which is no longer supported. Remove the key in next.config.ts and continue.";
      }
      if (msg.includes("invalid next.config")) {
        return "There's an invalid setting in next.config.ts. Fix unsupported or mistyped options in that file.";
      }
      return `Configuration in '${err.error.file}' is invalid. Fix missing or mistyped settings in that file.`;
    },
  },
  resource: {
    layman: (err) =>
      err.severity === "critical"
        ? "The build ran out of memory. This usually happens with very large projects or heavy plugins."
        : "The system is low on resources (disk or memory), preventing the build from finishing.",
  },
  environment: {
    layman: () =>
      "There's an issue with the development environment (like a missing command or bad permissions). I need to check the system setup.",
  },
  network: {
    layman: () =>
      "The package registry was unreachable from the sandbox. Retry install/build when registry connectivity is available.",
  },
  unknown: {
    layman: (err) =>
      `The build failed due to an error in '${err.error.file}'. Use the first error message as the next fix target: ${err.error.message.split("\n")[0]}`,
  },
};

export function generateSuggestion(
  error: BuildError,
  context: DiagnosticContext,
): string {
  const strategy =
    DIAGNOSTIC_STRATEGIES[error.type] ?? DIAGNOSTIC_STRATEGIES.unknown;
  if (!strategy) {
    return `The build failed due to an error in '${error.error.file}'. Use the first error message as the next fix target.`;
  }
  return strategy.layman(error, context);
}

export function buildUserFacingDiagnosis(report: BuildErrorReport): NonNullable<BuildErrorReport["userFacing"]> {
  const culprit = report.rootCause ?? report.errors[0];
  const fallback = {
    shortMessage: report.headline || "Build failed.",
    pinpoint: {
      file: "unknown",
      line: 0,
    },
    probableCause: "The build failed due to an unresolved error.",
    pinpointContext: "No reliable pinpoint context was extracted from the error output.",
    preciseFix: "Inspect the first concrete compiler/runtime error and apply a targeted fix.",
    nextStep: "Check the first build error and apply a targeted fix.",
  };

  if (!culprit) return fallback;
  const guidance = buildDiagnosisGuidance(culprit);

  const shortMessage =
    culprit.suggestion ||
    `Build failed in ${culprit.error.file}:${culprit.error.line}.`;

  return {
    shortMessage,
    pinpoint: {
      file: culprit.error.file,
      line: culprit.error.line,
      column: culprit.error.column,
      code: culprit.error.code,
      type: culprit.type,
      confidence: culprit.confidence,
    },
    probableCause: guidance.probableCause,
    pinpointContext: guidance.pinpointContext,
    preciseFix: guidance.preciseFix,
    nextStep: guidance.nextStep,
  };
}

function shouldIncludeRawOutputForLLM(report: BuildErrorReport): boolean {
  if (!report.rawOutput) return false;
  if (report.errors.length === 0) return true;

  const culprit = report.rootCause ?? report.errors[0];
  if (!culprit) return true;

  return culprit.type === "unknown" || culprit.confidence < 70;
}

function compactSnippet(snippet: string, maxChars: number = 1200): string {
  if (!snippet) return "";
  if (snippet.length <= maxChars) return snippet;
  return `${snippet.slice(0, maxChars)}\n...[truncated]`;
}

export function formatErrorForLLM(report: BuildErrorReport): string {
  const userFacing = report.userFacing ?? buildUserFacingDiagnosis(report);
  const lines: string[] = [
    "BUILD FAILED",
    "============",
    "",
    `Summary: ${report.headline}`,
    `Stage: ${report.summary.stage}`,
    `Errors: ${report.summary.totalErrors} total (${report.summary.criticalCount} critical, ${report.summary.errorCount} errors, ${report.summary.warningCount} warnings)`,
    "",
  ];

  if (userFacing) {
    lines.push("SIMPLIFIED DIAGNOSIS:");
    lines.push(`Message: ${userFacing.shortMessage}`);
    lines.push(
      `Pinpoint: ${userFacing.pinpoint.file}:${userFacing.pinpoint.line}${userFacing.pinpoint.column ? `:${userFacing.pinpoint.column}` : ""}`,
    );
    if (userFacing.pinpoint.code) {
      lines.push(`Code: ${userFacing.pinpoint.code}`);
    }
    if (userFacing.pinpoint.type) {
      lines.push(`Type: ${userFacing.pinpoint.type}`);
    }
    lines.push(`Probable Cause: ${userFacing.probableCause}`);
    lines.push(`Pinpoint Context: ${userFacing.pinpointContext}`);
    lines.push(`Precise Fix: ${userFacing.preciseFix}`);
    lines.push(`Next Step: ${userFacing.nextStep}`);
    lines.push("");
  }

  if (shouldIncludeRawOutputForLLM(report)) {
    lines.push("RAW BUILD OUTPUT (excerpt):");
    lines.push("```");
    lines.push(report.rawOutput.slice(-MAX_RAW_OUTPUT_FOR_LLM));
    lines.push("```");
    lines.push("");
  }

  if (report.rootCause) {
    lines.push("ROOT CAUSE:");
    lines.push(
      `File: ${report.rootCause.error.file}:${report.rootCause.error.line}`,
    );
    lines.push(`Type: ${report.rootCause.type}`);
    lines.push(`Message: ${report.rootCause.error.message}`);
    if (report.rootCause.suggestion) {
      lines.push(`Suggested Fix: ${report.rootCause.suggestion}`);
    }
    lines.push("");
  }

  for (const err of report.errors.slice(0, MAX_ERRORS_FOR_LLM)) {
    lines.push(
      `Error [${err.severity}]: ${err.error.file}:${err.error.line}${err.error.column ? `:${err.error.column}` : ""}`,
    );
    lines.push(
      `Type: ${err.type} | Stage: ${err.stage} | Confidence: ${err.confidence}%`,
    );
    lines.push(`Message: ${err.error.message}`);
    if (err.error.code) lines.push(`Code: ${err.error.code}`);
    if (err.error.target) lines.push(`Target: ${err.error.target}`);
    if (err.suggestion) lines.push(`Fix: ${err.suggestion}`);
    lines.push("");
    lines.push("Code Context:");
    lines.push("```typescript");
    lines.push(compactSnippet(err.error.snippet || "Code not available"));
    lines.push("```");

    if (err.context.importChain && err.context.importChain.length > 0) {
      lines.push("Import Chain:");
      for (const link of err.context.importChain) {
        lines.push(`  ${link.file}:${link.line} -> ${link.importPath}`);
      }
    }

    if (err.relatedFiles.length > 0) {
      lines.push("Related Files:");
      for (const rf of err.relatedFiles) {
        lines.push(`- ${rf.path}: ${rf.reason}`);
        if (rf.snippet) {
          lines.push("```typescript");
          lines.push(rf.snippet);
          lines.push("```");
        }
      }
    }

    if (err.relatedErrors.length > 0) {
      lines.push(`Related Error IDs: ${err.relatedErrors.join(", ")}`);
    }

    lines.push("");
  }

  if (report.errors.length > MAX_ERRORS_FOR_LLM) {
    lines.push(`... and ${report.errors.length - MAX_ERRORS_FOR_LLM} more errors`);
    lines.push("");
  }

  return lines.join("\n");
}

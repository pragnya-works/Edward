import {
  isErrorSeverity,
  type ValidationViolation,
} from "../../../../services/planning/validators/postgenValidator.types.js";

function violationTypeToErrorType(type: ValidationViolation["type"]): string {
  const ERROR_TYPE_BY_VIOLATION: Partial<Record<ValidationViolation["type"], string>> = {
    "missing-entry-point": "missing_import",
    "missing-project-file": "config",
    "file-line-limit-exceeded": "config",
    "import-placement": "syntax",
    "logic-quality": "runtime",
    "orphaned-import": "missing_import",
    "missing-package": "missing_import",
    "markdown-fence": "syntax",
  };
  return ERROR_TYPE_BY_VIOLATION[type] ?? "unknown";
}

export function buildPostgenValidationErrorReport(
  violations: ValidationViolation[],
): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const errors = violations.map((violation, index) => ({
    id: `postgen-${index + 1}`,
    headline: violation.message,
    type: violationTypeToErrorType(violation.type),
    severity: violation.severity,
    stage: "compile",
    confidence: 95,
    error: {
      file: violation.file || "unknown",
      line: 1,
      message: violation.message,
      snippet: "",
    },
    context: {},
    relatedErrors: [] as string[],
    relatedFiles: [] as Array<{ path: string; reason: string }>,
    suggestion: violation.message,
    timestamp: nowIso,
  }));

  const warningCount = errors.filter(
    (error) => !isErrorSeverity(error.severity),
  ).length;
  const errorCount = errors.length - warningCount;
  const rootCause =
    errors.find((error) => isErrorSeverity(error.severity)) || errors[0];

  return {
    failed: true,
    headline: "Post-generation quality gate failed",
    summary: {
      totalErrors: errors.length,
      criticalCount: 0,
      errorCount,
      warningCount,
      uniqueTypes: Array.from(new Set(errors.map((error) => error.type))),
      stage: "compile",
    },
    errors,
    rootCause,
    command: "post-generation validation",
    rawOutput: violations.map((violation) => `- ${violation.message}`).join("\n"),
    userFacing: {
      shortMessage:
        "Generated code failed deterministic quality checks before build.",
      pinpoint: {
        file: rootCause?.error.file || "unknown",
        line: 1,
        type: rootCause?.type || "unknown",
        confidence: 95,
      },
      probableCause:
        "The response contained structural issues (imports/entrypoints/logic quality) that are known to produce unstable results.",
      pinpointContext:
        rootCause?.error.message ||
        "A validation rule failed while inspecting generated files.",
      preciseFix:
        "Regenerate affected files with complete imports at the top, valid entrypoint wiring, and concrete component logic.",
      nextStep: "Apply the listed validation fixes, then rebuild.",
    },
    processedAt: nowIso,
    duration: 0,
  };
}

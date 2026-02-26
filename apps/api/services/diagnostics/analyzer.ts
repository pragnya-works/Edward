import type { BuildError, BuildErrorReport } from "./types.js";

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

type DiagnosticContext = {
  packageJson?: Record<string, unknown>;
};

interface DiagnosticStrategy {
  layman: (error: BuildError, context: DiagnosticContext) => string;
}

const MAX_RAW_OUTPUT_FOR_LLM = 2500;
const MAX_ERRORS_FOR_LLM = 2;

const DIAGNOSTIC_STRATEGIES: Record<string, DiagnosticStrategy> = {
  missing_import: {
    layman: (err) => {
      const target = err.error.target || "something";
      return `I can't find '${target}'. It looks like a plugin or package is missing in your project. Ask me to 'Install ${target.split("/")[0]}' to fix this.`;
    },
  },
  type_mismatch: {
    layman: (err) => {
      if (err.error.code === "TS2554")
        return "You're missing some required information (arguments) for a function call. Check the highlighted code.";
      if (err.error.code === "TS2786")
        return "This component isn't a valid React component. Check if it's imported correctly or if the file has the right extension (.tsx).";
      const target = err.error.target;
      return target
        ? `It looks like '${target}' is being used incorrectly or has a typo in its definition.`
        : "There's a mismatch in how data is being used here. Check the types.";
    },
  },
  syntax: {
    layman: (err) =>
      `There's a typo in '${err.error.file}' on line ${err.error.line}. It looks like a bracket, semicolon, or symbol is misplaced. Check the code I've highlighted.`,
  },
  config: {
    layman: (err) => {
      const msg = err.error.message.toLowerCase();
      if (msg.includes("eslint") && msg.includes("next.config")) {
        return "Your Next.js configuration is using an outdated 'eslint' key which is no longer supported. Ask me to 'Remove eslint from next.config.ts'.";
      }
      if (msg.includes("invalid next.config")) {
        return "There's an invalid setting in your next.config.ts. Check the file for typos or unsupported options.";
      }
      return `Your configuration in '${err.error.file}' isn't valid. Something is missing or typed incorrectly in the settings.`;
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
      "I couldn't reach the package registry. Check your connection or the registry stats.",
  },
  unknown: {
    layman: (err) =>
      `The build failed due to an error in '${err.error.file}'. Check the message for clues: ${err.error.message.split("\n")[0]}`,
  },
};

export function generateSuggestion(
  error: BuildError,
  context: DiagnosticContext,
): string {
  const strategy =
    DIAGNOSTIC_STRATEGIES[error.type] ?? DIAGNOSTIC_STRATEGIES.unknown;
  if (!strategy) {
    return `The build failed due to an error in '${error.error.file}'. Check the message for clues.`;
  }
  return strategy.layman(error, context);
}

function buildLocation(error: BuildError): string {
  return `${error.error.file}:${error.error.line}${error.error.column ? `:${error.error.column}` : ""}`;
}

function firstLine(text: string): string {
  return text.split("\n")[0] || text;
}

type DiagnosisGuidance = {
  probableCause: string;
  pinpointContext: string;
  preciseFix: string;
  nextStep: string;
};

function isViteInternalCompatibilityFailure(error: BuildError): boolean {
  const file = error.error.file.toLowerCase();
  const message = firstLine(error.error.message).toLowerCase();

  if (!file.includes("/node_modules/")) return false;
  if (!file.includes("/vite/dist/node/chunks/config.js")) return false;

  return (
    message.includes("crypto.hash is not a function") ||
    message.includes("runtime error") ||
    message.includes("typeerror")
  );
}

function buildDiagnosisGuidance(error: BuildError): DiagnosisGuidance {
  const location = buildLocation(error);
  const target = error.error.target ? `'${error.error.target}'` : "the referenced symbol";
  const importHint = error.context.importChain?.[0];
  const relatedHint = error.relatedFiles?.[0];

  switch (error.type) {
    case "missing_import": {
      const importContext = importHint
        ? `Import chain points to '${importHint.importPath}' from ${importHint.file}:${importHint.line}.`
        : relatedHint
          ? `Related usage was also detected in ${relatedHint.path}.`
          : `No valid import/provider was found for ${target}.`;
      return {
        probableCause: "A dependency or import path is missing, invalid, or unresolved.",
        pinpointContext: `At ${location}, the compiler cannot resolve ${target}. ${importContext}`,
        preciseFix: importHint
          ? `Edit ${importHint.file}:${importHint.line} and correct the import path/package '${importHint.importPath}'. If it is an external package, install it and rebuild.`
          : `Open ${error.error.file}:${error.error.line}, add/correct the import for ${target}, ensure the source exports it, then rebuild.`,
        nextStep: "Correct the import/dependency resolution at the pinpointed location and rerun the build.",
      };
    }
    case "type_mismatch": {
      const msg = firstLine(error.error.message);
      if (error.error.code === "TS2304") {
        return {
          probableCause: "A referenced name is used without a valid declaration or import.",
          pinpointContext: `At ${location}, TypeScript cannot find ${target}. This stops typecheck before bundling.`,
          preciseFix: `In ${error.error.file}:${error.error.line}, either import ${target} from the correct module or declare it in scope, then rebuild.`,
          nextStep: "Restore symbol visibility (import/declaration) at the pinpointed line and rerun build.",
        };
      }
      return {
        probableCause: "TypeScript found a mismatch between expected and actual types.",
        pinpointContext: `At ${location}, typecheck fails with: ${msg}`,
        preciseFix: `Open ${error.error.file}:${error.error.line} and align the value/prop/function signature to the expected type, then rebuild.`,
        nextStep: "Fix the type mismatch at the pinpointed line and rerun build.",
      };
    }
    case "syntax": {
      const snippet = firstLine(error.error.snippet || "").trim();
      return {
        probableCause: "The parser found invalid syntax in source code.",
        pinpointContext: snippet
          ? `At ${location}, parsing failed near: ${snippet}`
          : `At ${location}, parsing failed due to invalid token/structure.`,
        preciseFix: `Open ${error.error.file}:${error.error.line}, fix bracket/quote/operator structure around the pinpoint, then rebuild.`,
        nextStep: "Correct syntax exactly at the pinpoint and rerun build.",
      };
    }
    case "config": {
      const msg = firstLine(error.error.message);
      const msgLower = msg.toLowerCase();
      if (
        msgLower.includes("eisdir") ||
        msgLower.includes("illegal operation on a directory")
      ) {
        return {
          probableCause:
            "An HTML asset URL points to a directory path, so Vite is trying to read a directory as a file during build-html.",
          pinpointContext:
            `At ${location}, Vite reported directory-read failure (${msg}). This commonly happens when index.html uses canonical/asset href values like '/'.`,
          preciseFix:
            "Edit index.html and make canonical/asset href values absolute http(s) URLs (for example, https://edwardd.app/), not '/'. Then rebuild.",
          nextStep:
            "Fix canonical/asset hrefs in index.html and rerun build.",
        };
      }
      return {
        probableCause: "A framework/build configuration key or value is invalid.",
        pinpointContext: `At ${location}, config validation failed: ${msg}`,
        preciseFix: `Edit ${error.error.file}${error.error.line > 0 ? `:${error.error.line}` : ""} and replace/remove the invalid config option causing the failure, then rebuild.`,
        nextStep: "Update the invalid config key/value and rerun build.",
      };
    }
    case "runtime": {
      const msg = firstLine(error.error.message);
      if (isViteInternalCompatibilityFailure(error)) {
        return {
          probableCause:
            "Vite crashed inside its own runtime bundle because the Node.js runtime and installed Vite version are incompatible.",
          pinpointContext:
            `At ${location}, execution failed inside Vite internals (${msg}). This is usually environment/toolchain mismatch, not an application source bug.`,
          preciseFix:
            "Do not edit node_modules. Use Node.js 20.19+ (or 22+), and keep Vite on a compatible major (for older runtimes, pin vite@^6 with matching plugins), then reinstall dependencies and rebuild.",
          nextStep:
            "Align Node/Vite versions, reinstall dependencies, and rerun build.",
        };
      }
      return {
        probableCause: "A runtime execution path failed during build or prerender.",
        pinpointContext: `At ${location}, runtime execution failed with: ${msg}`,
        preciseFix: `Open ${error.error.file}:${error.error.line}, guard unsafe runtime assumptions (null/undefined/env/path), then rebuild.`,
        nextStep: "Harden runtime path at pinpoint and rerun build.",
      };
    }
    case "resource":
      return {
        probableCause: "Build process exceeded available compute resources.",
        pinpointContext: `Build failed around ${location} while processing a resource-heavy step.`,
        preciseFix: "Reduce bundle/build load (heavy plugins/assets), or increase memory limits, then rerun build.",
        nextStep: "Lower build resource pressure and rerun.",
      };
    case "network":
      return {
        probableCause: "Required network access failed during dependency/build operations.",
        pinpointContext: `Failure surfaced near ${location} because registry/network requests did not complete.`,
        preciseFix: "Retry when network/registry is healthy; if reproducible, pin/fix registry configuration and rerun.",
        nextStep: "Restore connectivity and rerun build.",
      };
    case "environment":
      if (isViteInternalCompatibilityFailure(error)) {
        return {
          probableCause:
            "The build runtime does not satisfy the installed Vite toolchain requirements.",
          pinpointContext:
            `Failure surfaced at ${location} inside Vite internals, indicating runtime/tooling mismatch rather than user code failure.`,
          preciseFix:
            "Upgrade Node.js in the sandbox/runtime (20.19+ or 22+), or pin Vite to a compatible major, then reinstall dependencies and rebuild.",
          nextStep:
            "Fix runtime/toolchain compatibility and rerun build.",
        };
      }
      return {
        probableCause: "Tooling/runtime environment is missing required command, permission, or configuration.",
        pinpointContext: `Build stopped near ${location} due to environment prerequisites not being met.`,
        preciseFix: "Verify required build tools/versions/permissions in the environment, then rerun build.",
        nextStep: "Fix environment prerequisites and rerun.",
      };
    default: {
      const msg = firstLine(error.error.message);
      return {
        probableCause: "An unclassified build error blocked compilation.",
        pinpointContext: `At ${location}, build failed with: ${msg}`,
        preciseFix: `Start with ${error.error.file}:${error.error.line}, resolve the first error completely, then rebuild to reveal any next blocker.`,
        nextStep: "Resolve the first pinpointed blocker and rerun build.",
      };
    }
  }
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

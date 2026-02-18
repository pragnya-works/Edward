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

export function formatErrorForLLM(report: BuildErrorReport): string {
  const lines: string[] = [
    "BUILD FAILED",
    "============",
    "",
    `Summary: ${report.headline}`,
    `Stage: ${report.summary.stage}`,
    `Errors: ${report.summary.totalErrors} total (${report.summary.criticalCount} critical, ${report.summary.errorCount} errors, ${report.summary.warningCount} warnings)`,
    "",
  ];

  if (report.rawOutput) {
    lines.push("RAW BUILD OUTPUT (excerpt):");
    lines.push("```");
    lines.push(report.rawOutput.slice(-6000));
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

  for (const err of report.errors.slice(0, 3)) {
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
    lines.push(err.error.snippet || "Code not available");
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

  if (report.errors.length > 3) {
    lines.push(`... and ${report.errors.length - 3} more errors`);
    lines.push("");
  }

  return lines.join("\n");
}

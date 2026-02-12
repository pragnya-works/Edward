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

export function generateSuggestion(
  error: BuildError,
  context: { packageJson?: Record<string, unknown> },
): string | undefined {
  const { type, error: err } = error;

  switch (type) {
    case "missing_import":
      if (err.target) {
        const deps = {
          ...(context.packageJson?.dependencies as Record<string, string>),
          ...(context.packageJson?.devDependencies as Record<string, string>),
        };
        const parts = err.target.split("/").filter(Boolean);
        const packageName = err.target.startsWith("@")
          ? parts.slice(0, 2).join("/")
          : parts[0];
        if (!packageName) {
          return "Check import path or install missing package";
        }
        if (deps[packageName]) {
          return `Package '${packageName}' is in package.json but module '${err.target}' cannot be resolved. Check export paths or reinstall with 'rm -rf node_modules && pnpm install'`;
        }
        return `Install missing package: pnpm add ${packageName}`;
      }
      return "Check import path or install missing package";

    case "type_mismatch":
      if (err.code === "TS2554") {
        return "Check function signature and provide correct number of arguments";
      }
      if (err.code === "TS2786") {
        return "Ensure component is properly imported and is a valid React component";
      }
      return err.target
        ? `Fix type definition or import for '${err.target}'`
        : "Fix type annotation";

    case "syntax":
      return "Check for missing brackets, semicolons, or typos in the highlighted code";

    case "config":
      return "Review configuration file for syntax errors or missing properties";

    case "resource":
      if (error.severity === "critical") {
        return "Increase Node.js memory limit: NODE_OPTIONS='--max-old-space-size=4096'";
      }
      return "Free up disk space or increase resource limits";

    case "environment":
      return "Check Node.js/npm installation and permissions";

    case "network":
      return "Check network connection and retry. If using a registry mirror, verify it's accessible";

    default:
      return undefined;
  }
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

import { DiagnosticCategory } from "./types.js";
import type { Diagnostic, ParsedError } from "./types.js";
import { typescriptParser } from "./parsers/typescript.parser.js";
import { nextjsParser } from "./parsers/nextjs.parser.js";
import { viteParser } from "./parsers/vite.parser.js";
import { genericParser } from "./parsers/generic.parser.js";
import {
  categorizeTsCode,
  categorizeByKeywords,
  createDiagnosticId,
  isErrorSeverity,
  isWarningSeverity,
} from "./diagnostics.schemas.js";
import { logger } from "../../utils/logger.js";

export { isErrorSeverity, isWarningSeverity } from "./diagnostics.schemas.js";

const PARSERS = [typescriptParser, nextjsParser, viteParser, genericParser];

interface ExtractionOptions {
  framework?: string;
  errorLog: string;
  stdout?: string;
}

interface ExtractionResult {
  diagnostics: Diagnostic[];
  hasErrors: boolean;
  hasWarnings: boolean;
}

export function extractDiagnostics(options: ExtractionOptions): ExtractionResult {
  const { framework, errorLog, stdout = "" } = options;
  const combined = `${errorLog}\n${stdout}`;

  logger.debug(
    { framework, errorLength: errorLog.length },
    "Extracting diagnostics from build output",
  );

  const allDiagnostics: Diagnostic[] = [];
  const seen = new Set<string>();

  for (const parser of PARSERS) {
    if (!parser.canHandle(combined, framework)) continue;

    const parsed = parser.parse(combined, framework);
    if (parsed.length === 0) continue;

    const diagnostics = parsedToDiagnostics(parsed, combined);
    for (const d of diagnostics) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        allDiagnostics.push(d);
      }
    }

    if (parser.name !== "generic" && allDiagnostics.length > 0) break;
  }

  const hasErrors = allDiagnostics.some((d) => isErrorSeverity(d.severity));
  const hasWarnings = allDiagnostics.some((d) => isWarningSeverity(d.severity));

  logger.info(
    { diagnosticCount: allDiagnostics.length, hasErrors, hasWarnings, framework },
    "Diagnostic extraction completed",
  );

  return { diagnostics: allDiagnostics, hasErrors, hasWarnings };
}

function parsedToDiagnostics(errors: ParsedError[], rawError: string): Diagnostic[] {
  return errors.map((e) => {
    const category = e.code
      ? categorizeTsCode(e.code)
      : categorizeByKeywords(e.message || rawError);

    const id = createDiagnosticId(e.file, e.line, e.message);

    return {
      id,
      category,
      severity: e.severity,
      file: e.file?.replace(/^\.\//, ""),
      line: e.line,
      column: e.column,
      message: e.message,
      ruleId: e.code,
      suggestedAction: suggestAction(category, e.message),
    };
  });
}

function suggestAction(
  category: DiagnosticCategory,
  message: string,
): string | undefined {
  switch (category) {
    case DiagnosticCategory.MissingModule: {
      const pkg = message.match(/['"]([^'"]+)['"]/)?.[1];
      return pkg ? `Install missing package: pnpm add ${pkg}` : "Install the missing module";
    }
    case DiagnosticCategory.MissingExport:
      return "Check the module's exports and update the import";
    case DiagnosticCategory.SyntaxError:
      return "Fix the syntax error at the indicated location";
    case DiagnosticCategory.TypeError:
      return "Fix the type mismatch";
    case DiagnosticCategory.CssError:
      return "Fix the CSS syntax or configuration";
    case DiagnosticCategory.ConfigError:
      return "Check build tool configuration";
    case DiagnosticCategory.EntryPoint:
      return "Create or fix the entry point file";
    case DiagnosticCategory.Dependency:
      return "Install or update the dependency";
    case DiagnosticCategory.BuildCommand:
      return "Fix the build script in package.json";
    case DiagnosticCategory.Unknown:
      return undefined;
  }
}

export function getRelatedFiles(diagnostics: Diagnostic[]): string[] {
  const files = new Set<string>();
  for (const d of diagnostics) {
    if (d.file) files.add(d.file);
    if (d.relatedFiles) {
      for (const f of d.relatedFiles) files.add(f);
    }
  }
  return Array.from(files);
}

export function formatDiagnosticsForContext(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return "";

  const lines = ["BUILD DIAGNOSTICS:"];
  for (const d of diagnostics) {
    const location = d.file
      ? `${d.file}${d.line ? `:${d.line}` : ""}${d.column ? `:${d.column}` : ""}`
      : "unknown location";
    lines.push(`[${d.severity.toUpperCase()}] ${d.category} at ${location}`);
    lines.push(`  ${d.message}`);
    if (d.ruleId) lines.push(`  Rule: ${d.ruleId}`);
    if (d.suggestedAction) lines.push(`  Fix: ${d.suggestedAction}`);
    lines.push("");
  }
  return lines.join("\n");
}

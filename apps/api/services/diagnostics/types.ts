export type BuildErrorType =
  | "missing_import"
  | "syntax"
  | "type_mismatch"
  | "config"
  | "runtime"
  | "environment"
  | "resource"
  | "network"
  | "unknown";

export type ErrorSeverity = "critical" | "error" | "warning";

export type BuildStage =
  | "parse"
  | "compile"
  | "typecheck"
  | "transform"
  | "bundle"
  | "optimize"
  | "runtime"
  | "unknown";

export interface BuildError {
  id: string;
  headline: string;
  type: BuildErrorType;
  severity: ErrorSeverity;
  stage: BuildStage;
  confidence: number;
  error: {
    file: string;
    line: number;
    column?: number;
    message: string;
    code?: string;
    snippet: string;
    fullContent?: string;
    target?: string;
    stackTrace?: string[];
  };
  context: {
    packageJson?: Record<string, unknown>;
    tsConfig?: Record<string, unknown>;
    importChain?: Array<{ file: string; line: number; importPath: string }>;
    recentChanges?: string[];
  };
  relatedErrors: string[];
  relatedFiles: Array<{
    path: string;
    reason: string;
    snippet?: string;
  }>;
  suggestion?: string;
  timestamp: string;
}

export interface BuildErrorReport {
  failed: true;
  headline: string;
  summary: {
    totalErrors: number;
    criticalCount: number;
    errorCount: number;
    warningCount: number;
    uniqueTypes: BuildErrorType[];
    stage: BuildStage;
  };
  errors: BuildError[];
  rootCause?: BuildError;
  framework?: string;
  command: string;
  rawOutput: string;
  processedAt: string;
  duration: number;
}

export interface FileCache {
  content: string;
  timestamp: number;
}

export interface ErrorPattern {
  name: string;
  regex: RegExp;
  stage: BuildStage;
}

export interface ModuleErrorPattern {
  regex: RegExp;
  type: BuildErrorType;
  severity?: ErrorSeverity;
}

export interface TsErrorInfo {
  type: BuildErrorType;
  severity: ErrorSeverity;
  description: string;
}

export enum DiagnosticCategory {
  MissingModule = "missing_module",
  MissingExport = "missing_export",
  TypeError = "type_error",
  SyntaxError = "syntax_error",
  CssError = "css_error",
  ConfigError = "config_error",
  EntryPoint = "entry_point",
  Dependency = "dependency",
  BuildCommand = "build_command",
  Unknown = "unknown",
}

export enum DiagnosticSeverity {
  Error = "error",
  Warning = "warning",
}

export enum DiagnosticMethod {
  Parsed = "parsed",
  Tsc = "tsc",
  Inferred = "inferred",
  None = "none",
}

export interface ParsedError {
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  severity: DiagnosticSeverity;
}

export interface Diagnostic {
  id: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  file?: string;
  line?: number;
  column?: number;
  message: string;
  ruleId?: string;
  suggestedAction?: string;
  relatedFiles?: string[];
}

export interface ErrorParser {
  name: string;
  canHandle(errorText: string, framework?: string): boolean;
  parse(errorText: string, framework?: string): ParsedError[];
}

export interface EnrichmentResult {
  rawError: string;
  diagnostics: Diagnostic[];
  method: DiagnosticMethod;
  confidence: number;
}

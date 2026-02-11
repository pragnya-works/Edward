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

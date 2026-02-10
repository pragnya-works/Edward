export type ErrorCategory =
  | "syntax"
  | "type"
  | "import"
  | "buildConfig"
  | "runtime"
  | "unknown";

export type DiagnosticMethod =
  | "parsed"
  | "tsc"
  | "inferred"
  | "none";

export interface ErrorLocation {
  file: string;
  line?: number;
  column?: number;
}

export interface ParsedError {
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  severity: "error" | "warning";
}

export interface ErrorDiagnostic {
  category: ErrorCategory;
  primaryFile?: string;
  affectedFiles: string[];
  lineNumbers: ErrorLocation[];
  errorCode?: string;
  excerpt: string;
  diagnosticMethod: DiagnosticMethod;
  confidence: number;
}

export interface ErrorParser {
  name: string;
  canHandle(errorText: string, framework?: string): boolean;
  parse(errorText: string, framework?: string): ParsedError[];
}

export interface EnrichmentResult {
  rawError: string;
  structured: ErrorDiagnostic;
}

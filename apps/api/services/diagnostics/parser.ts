import type { BuildErrorType, ErrorSeverity, BuildStage } from "./types.js";
import {
  STRIP_ANSI,
  ERROR_PATTERNS,
  MODULE_ERROR_PATTERNS,
  TS_ERROR_MAP,
  STAGE_DETECTION_PATTERNS,
} from "./constants.js";

export interface ParsedError {
  file: string;
  line: number;
  column?: number;
  code?: string;
  message: string;
  severity: ErrorSeverity;
  stage: BuildStage;
}

function stripAnsi(str: string): string {
  return str.replace(STRIP_ANSI, "");
}

export function detectStage(output: string): BuildStage {
  for (const { pattern, stage } of STAGE_DETECTION_PATTERNS) {
    if (pattern.test(output)) return stage;
  }
  return "unknown";
}

function generateErrorId(
  file: string,
  line: number,
  message: string,
): string {
  const normalizedFile = file.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
  const msgHash = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 50)
    .split("")
    .reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  return `${normalizedFile}:${line}:${Math.abs(msgHash).toString(36)}`;
}

export function categorizeError(
  message: string,
  code?: string,
): { type: BuildErrorType; severity: ErrorSeverity } {
  if (code && TS_ERROR_MAP[code]) {
    return {
      type: TS_ERROR_MAP[code].type,
      severity: TS_ERROR_MAP[code].severity,
    };
  }

  const m = message.toLowerCase();

  for (const pattern of MODULE_ERROR_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(m)) {
      return {
        type: pattern.type,
        severity: pattern.severity || "error",
      };
    }
  }

  if (m.includes("warning") || m.includes("deprecated")) {
    return { type: "unknown", severity: "warning" };
  }

  return { type: "unknown", severity: "error" };
}

export function extractTarget(
  type: BuildErrorType,
  message: string,
): string | undefined {
  if (type === "missing_import") {
    const match = message.match(/["']([^"']+)["']/);
    return match?.[1];
  }
  if (type === "type_mismatch") {
    const match = message.match(
      /(?:cannot find name|does not exist on type|property)\s+['"]?([\w$]+)['"]?/i,
    );
    return match?.[1];
  }
  return undefined;
}

export function calculateConfidence(
  parsed: ParsedError,
  hasSnippet: boolean,
): number {
  let score = 0;
  if (parsed.file && parsed.file !== "unknown") score += 30;
  if (parsed.line > 0) score += 20;
  if (parsed.column && parsed.column > 0) score += 10;
  if (parsed.code) score += 15;
  if (hasSnippet) score += 25;
  return score;
}

export function parseErrors(output: string): ParsedError[] {
  if (!output || output.length === 0) return [];
  
  const cleanOutput = stripAnsi(output);
  const errors: ParsedError[] = [];
  const seen = new Set<string>();
  const stage = detectStage(output);

  for (const pattern of ERROR_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.regex.exec(cleanOutput)) !== null) {
      let file: string | undefined;
      let line: string | undefined;
      let column: string | undefined;
      let code: string | undefined;
      let message: string | undefined;

      switch (pattern.name) {
        case "typescript":
        case "vite_esbuild":
        case "nextjs":
          [, file, line, column, code, message] = match;
          break;
        case "webpack":
          [, file, message, line, column] = match;
          break;
        case "rollup":
          [, file, line, column, message] = match;
          break;
        case "stack_trace":
          [, file, line, column] = match;
          message = "Runtime error";
          break;
      }

      if (!file || !line) continue;

      const cleanFile = file.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
      const cleanMessage =
        message?.replace(/\s+/g, " ").trim().slice(0, 500) || "Unknown error";
      const lineNum = parseInt(line, 10);
      
      if (lineNum < 0) continue; // Skip invalid line numbers
      
      const key = generateErrorId(cleanFile, lineNum, cleanMessage);

      if (!seen.has(key)) {
        seen.add(key);
        const categorized = categorizeError(cleanMessage, code || undefined);
        errors.push({
          file: cleanFile,
          line: lineNum,
          column: column ? parseInt(column, 10) : undefined,
          code: code || undefined,
          message: cleanMessage,
          severity: categorized.severity,
          stage: pattern.stage || stage,
        });
      }
    }
  }

  const modulePattern = MODULE_ERROR_PATTERNS[0];
  if (modulePattern) {
    modulePattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = modulePattern.regex.exec(cleanOutput)) !== null) {
      const moduleName = match[1] || match[2] || match[3];
      if (!moduleName) continue;

      const key = `module:${moduleName}`;
      if (!seen.has(key)) {
        seen.add(key);
        errors.push({
          file: "unknown",
          line: 0,
          message: `Cannot find module '${moduleName}'`,
          severity: "error",
          stage,
        });
      }
    }
  }

  return errors.sort((a, b) => {
    const severityOrder = { critical: 0, error: 1, warning: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

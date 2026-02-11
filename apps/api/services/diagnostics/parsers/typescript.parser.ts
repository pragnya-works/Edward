import { DiagnosticSeverity } from "../types.js";
import type { ErrorParser, ParsedError } from "../types.js";

export const typescriptParser: ErrorParser = {
  name: "typescript",

  canHandle(errorText: string): boolean {
    return (
      errorText.includes("error TS") ||
      /TS\d{4}/.test(errorText) ||
      /\w+\.tsx?\(\d+,\d+\):/.test(errorText) ||
      /\w+\.tsx?:\d+:\d+\s*-\s*error\s+TS/.test(errorText)
    );
  },

  parse(errorText: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = errorText.split("\n");

    for (const line of lines) {
      const parenFormat = line.match(
        /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/,
      );
      if (parenFormat) {
        const [, file, lineNum, col, severity, code, message] = parenFormat;
        if (file && lineNum && col && message) {
          errors.push({
            file: file.trim(),
            line: parseInt(lineNum, 10),
            column: parseInt(col, 10),
            code,
            message: message.trim(),
            severity: severity === "warning"
              ? DiagnosticSeverity.Warning
              : DiagnosticSeverity.Error,
          });
          continue;
        }
      }

      const colonFormat = line.match(
        /^(.+?):([\d]+):([\d]+)\s*-\s*(error|warning)\s+(TS\d+):\s*(.+)$/,
      );
      if (colonFormat) {
        const [, file, lineNum, col, severity, code, message] = colonFormat;
        if (file && lineNum && col && message) {
          errors.push({
            file: file.trim(),
            line: parseInt(lineNum, 10),
            column: parseInt(col, 10),
            code,
            message: message.trim(),
            severity: severity === "warning"
              ? DiagnosticSeverity.Warning
              : DiagnosticSeverity.Error,
          });
          continue;
        }
      }

      const typeError = line.match(/Type (error|warning):\s*(.+)/i);
      if (typeError) {
        const [, severity, message] = typeError;
        if (severity && message) {
          errors.push({
            message: message.trim(),
            severity: severity.toLowerCase() === "warning"
              ? DiagnosticSeverity.Warning
              : DiagnosticSeverity.Error,
          });
        }
      }
    }

    return errors;
  },
};

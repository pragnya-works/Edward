import type { ErrorParser, ParsedError } from '../types.js';

export const typescriptParser: ErrorParser = {
  name: 'typescript',

  canHandle(errorText: string): boolean {
    return (
      errorText.includes('error TS') ||
      /TS\d{4}/.test(errorText) ||
      /\w+\.tsx?\(\d+,\d+\):/.test(errorText) ||
      /\w+\.tsx?:\d+:\d+\s*-\s*error\s+TS/.test(errorText)
    );
  },

  parse(errorText: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = errorText.split('\n');

    for (const line of lines) {
      const match1 = line.match(/^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/);
      if (match1) {
        const [, file, lineNum, col, severity, code, message] = match1;
        if (file && lineNum && col && message) {
          errors.push({
            file: file.trim(),
            line: parseInt(lineNum, 10),
            column: parseInt(col, 10),
            code,
            message: message.trim(),
            severity: severity as 'error' | 'warning',
          });
        }
        continue;
      }

      const match2 = line.match(/^(.+?):(\d+):(\d+)\s*-\s*(error|warning)\s+(TS\d+):\s*(.+)$/);
      if (match2) {
        const [, file, lineNum, col, severity, code, message] = match2;
        if (file && lineNum && col && message) {
          errors.push({
            file: file.trim(),
            line: parseInt(lineNum, 10),
            column: parseInt(col, 10),
            code,
            message: message.trim(),
            severity: severity as 'error' | 'warning',
          });
        }
        continue;
      }

      const match3 = line.match(/Type (error|warning):\s*(.+)/i);
      if (match3) {
        const [, severity, message] = match3;
        if (severity && message) {
          errors.push({
            message: message.trim(),
            severity: severity.toLowerCase() as 'error' | 'warning',
          });
        }
        continue;
      }
    }

    return errors;
  },
};

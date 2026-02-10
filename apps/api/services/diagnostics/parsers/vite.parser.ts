import type { ErrorParser, ParsedError } from '../types.js';

export const viteParser: ErrorParser = {
  name: 'vite',

  canHandle(errorText: string, framework?: string): boolean {
    const lower = errorText.toLowerCase();
    return (
      framework === 'vite-react' ||
      lower.includes('[vite]') ||
      lower.includes('vite') ||
      errorText.includes('✘ [ERROR]') ||
      lower.includes('transform failed')
    );
  },

  parse(errorText: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = errorText.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const errorHeader = line.match(/✘ \[ERROR\]/);
      if (errorHeader && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (nextLine) {
          const pathMatch = nextLine.match(/^(.+\.(?:tsx?|jsx?)):(\d+):(\d+):\s*ERROR:\s*(.+)$/);
          if (pathMatch) {
            const [, file, lineNum, col, message] = pathMatch;
            if (file && lineNum && col && message) {
              errors.push({
                file: file.trim(),
                line: parseInt(lineNum, 10),
                column: parseInt(col, 10),
                message: message.trim(),
                severity: 'error',
              });
            }
            continue;
          }
        }
      }

      const viteError = line.match(/\[vite\]\s*(.+?):\s*(.+)/i);
      if (viteError) {
        const [, errorType, message] = viteError;
        errors.push({
          message: `${errorType}: ${message}`.trim(),
          severity: 'error',
        });
        continue;
      }

      const standardError = line.match(/^(.+\.(?:tsx?|jsx?)):(\d+):(\d+)\s*-\s*error:\s*(.+)$/i);
      if (standardError) {
        const [, file, lineNum, col, message] = standardError;
        if (file && lineNum && col && message) {
          errors.push({
            file: file.trim(),
            line: parseInt(lineNum, 10),
            column: parseInt(col, 10),
            message: message.trim(),
            severity: 'error',
          });
        }
        continue;
      }

      const importError = line.match(/Failed to resolve import\s+["'](.+?)["']\s+from\s+["'](.+?)["']/i);
      if (importError) {
        const [, moduleName, file] = importError;
        if (file) {
          errors.push({
            file: file.trim(),
            message: `Failed to resolve import "${moduleName}"`,
            severity: 'error',
          });
        }
        continue;
      }

      const transformError = line.match(/Transform failed with \d+ error/i);
      if (transformError) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const detailLine = lines[j];
          if (detailLine) {
            const detailMatch = detailLine.match(/^(.+\.(?:tsx?|jsx?)):(\d+):(\d+)/);
            if (detailMatch) {
              const [, file, lineNum, col] = detailMatch;
              if (file && lineNum && col) {
                const errorMsg = detailLine.substring(detailMatch[0].length).trim();
                errors.push({
                  file: file.trim(),
                  line: parseInt(lineNum, 10),
                  column: parseInt(col, 10),
                  message: errorMsg || 'Transform error',
                  severity: 'error',
                });
              }
            }
          }
        }
      }
    }

    return errors;
  },
};

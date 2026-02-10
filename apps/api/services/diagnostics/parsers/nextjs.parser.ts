import type { ErrorParser, ParsedError } from '../types.js';

export const nextjsParser: ErrorParser = {
  name: 'nextjs',

  canHandle(errorText: string, framework?: string): boolean {
    return (
      framework === 'nextjs' ||
      errorText.includes('next build') ||
      errorText.includes('Next.js') ||
      errorText.includes('./pages/') ||
      errorText.includes('./app/') ||
      errorText.includes('Error: Failed to compile')
    );
  },

  parse(errorText: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = errorText.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const fileMatch = line.match(/^\.?\/?(.+\.(?:tsx?|jsx?))$/);
      if (fileMatch && fileMatch[1] && i + 1 < lines.length) {
        const file = fileMatch[1].replace(/^\.\//, '');
        const nextLine = lines[i + 1];
        
        if (nextLine && nextLine.trim().length > 0) {
          const errorMatch = nextLine.match(/\((\d+):(\d+)\)\s*(.+)/);
          if (errorMatch) {
            const [, lineNum, col, message] = errorMatch;
            if (lineNum && col && message) {
              errors.push({
                file,
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

      const compileError = line.match(/Error:\s*Failed to compile.*?(?:in|at)\s+(.+\.(?:tsx?|jsx?))/i);
      if (compileError && compileError[1]) {
        errors.push({
          file: compileError[1].replace(/^\.\//, ''),
          message: line.trim(),
          severity: 'error',
        });
        continue;
      }

      const moduleError = line.match(/Module not found:\s*(.+)/i);
      if (moduleError && moduleError[1]) {
        errors.push({
          message: moduleError[1].trim(),
          severity: 'error',
        });
        continue;
      }

      const pathError = line.match(/^\.?\/?(.+\.(?:tsx?|jsx?)):(\d+):(\d+)/);
      if (pathError) {
        const [, file, lineNum, col] = pathError;
        if (file && lineNum && col) {
          let message = '';
          for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
            const nextLine = lines[j];
            if (nextLine && nextLine.trim().length > 0 && !nextLine.match(/^\.?\/?(.+\.(?:tsx?|jsx?))/)) {
              message += nextLine.trim() + ' ';
            }
          }
          errors.push({
            file: file.replace(/^\.\//, ''),
            line: parseInt(lineNum, 10),
            column: parseInt(col, 10),
            message: message.trim() || 'Build error',
            severity: 'error',
          });
        }
      }
    }

    return errors;
  },
};

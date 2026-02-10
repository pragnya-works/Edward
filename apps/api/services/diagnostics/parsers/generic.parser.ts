import type { ErrorParser, ParsedError } from '../types.js';

export const genericParser: ErrorParser = {
  name: 'generic',

  canHandle(): boolean {
    return true;
  },

  parse(errorText: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = errorText.split('\n');
    
    const patterns = [
      /^(.+\.(?:tsx?|jsx?|css|json)):(\d+):(\d+)\s*(.+)$/,
      /at\s+(.+\.(?:tsx?|jsx?)):(\d+):(\d+)/,
      /^(.+\.(?:tsx?|jsx?))\((\d+),(\d+)\)/,
      /Error in\s+\.?\/(.+\.(?:tsx?|jsx?|css|json))/i,
    ];

    for (const line of lines) {
      let matched = false;

      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const file = match[1].replace(/^\.\//, '').trim();
          
          if (file && !file.includes('node_modules')) {
            const error: ParsedError = {
              file,
              message: match[4]?.trim() || line.trim(),
              severity: 'error',
            };

            if (match[2]) {
              error.line = parseInt(match[2], 10);
            }
            if (match[3]) {
              error.column = parseInt(match[3], 10);
            }

            errors.push(error);
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        const moduleMatch = line.match(/(?:Cannot find module|Module not found):\s*['"](.+?)['"]/i);
        if (moduleMatch) {
          errors.push({
            message: line.trim(),
            severity: 'error',
          });
          continue;
        }

        const importMatch = line.match(/(?:import|export)\s+(?:error|failed)/i);
        if (importMatch) {
          errors.push({
            message: line.trim(),
            severity: 'error',
          });
          continue;
        }

        const syntaxMatch = line.match(/SyntaxError:\s*(.+)/i);
        if (syntaxMatch && syntaxMatch[1]) {
          errors.push({
            message: syntaxMatch[1].trim(),
            severity: 'error',
          });
          continue;
        }
      }
    }

    if (errors.length === 0) {
      const filePattern = /(?:\.\/)?([a-zA-Z][\w/.@-]*\.(?:tsx?|jsx?|css|json))[\s:([\]]/g;
      const foundFiles = new Set<string>();
      let match;
      
      while ((match = filePattern.exec(errorText)) !== null) {
        if (match[1]) {
          const file = match[1].replace(/^\.\//, '');
          if (file && !file.includes('node_modules') && !foundFiles.has(file)) {
            foundFiles.add(file);
            errors.push({
              file,
              message: 'File mentioned in error output',
              severity: 'error',
            });
          }
        }
      }
    }

    return errors;
  },
};

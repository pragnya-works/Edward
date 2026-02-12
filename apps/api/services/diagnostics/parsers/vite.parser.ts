import { DiagnosticSeverity } from "../types.js";
import type { ErrorParser, ParsedError } from "../types.js";

const FILE_EXT = /\.(?:tsx?|jsx?|css|scss|less|json|vue|svelte)/;

export const viteParser: ErrorParser = {
  name: "vite",

  canHandle(errorText: string, framework?: string): boolean {
    if (framework === "vite-react") return true;
    return (
      errorText.includes("[vite]") ||
      errorText.includes("✘ [ERROR]") ||
      /\btransform failed\b/i.test(errorText) ||
      /\[plugin:vite/i.test(errorText)
    );
  },

  parse(errorText: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = errorText.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      if (/✘ \[ERROR\]/.test(line)) {
        const messageMatch = line.match(/✘ \[ERROR\]\s*(.+)/);
        const nextLine = lines[i + 1];
        if (nextLine) {
          const pathMatch = nextLine.match(
            new RegExp(`^(.+${FILE_EXT.source}):(\\d+):(\\d+)`),
          );
          if (pathMatch) {
            const [, file, lineNum, col] = pathMatch;
            if (file && lineNum && col) {
              errors.push({
                file: file.trim(),
                line: parseInt(lineNum, 10),
                column: parseInt(col, 10),
                message: messageMatch?.[1]?.trim() || "Build error",
                severity: DiagnosticSeverity.Error,
              });
              continue;
            }
          }
        }
        if (messageMatch?.[1]) {
          errors.push({ message: messageMatch[1].trim(), severity: DiagnosticSeverity.Error });
        }
        continue;
      }

      const pluginError = line.match(
        /\[plugin:(.+?)\]\s*(.+)/i,
      );
      if (pluginError) {
        errors.push({
          message: `Plugin ${pluginError[1]}: ${pluginError[2]}`.trim(),
          severity: DiagnosticSeverity.Error,
        });
        continue;
      }

      const importError = line.match(
        /Failed to resolve import\s+["'](.+?)["']\s+from\s+["'](.+?)["']/i,
      );
      if (importError) {
        const [, moduleName, file] = importError;
        if (file) {
          errors.push({
            file: file.trim(),
            message: `Failed to resolve import "${moduleName}"`,
            severity: DiagnosticSeverity.Error,
          });
        }
        continue;
      }

      const cssError = line.match(
        /CssSyntaxError:\s*(.+)/i,
      );
      if (cssError?.[1]) {
        const filePath = line.match(
          new RegExp(`(.+${FILE_EXT.source})(?::(\\d+):(\\d+))?`),
        );
        errors.push({
          file: filePath?.[1]?.trim(),
          line: filePath?.[2] ? parseInt(filePath[2], 10) : undefined,
          column: filePath?.[3] ? parseInt(filePath[3], 10) : undefined,
          message: cssError[1].trim(),
          severity: DiagnosticSeverity.Error,
        });
        continue;
      }

      if (/transform failed with \d+ error/i.test(line)) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const detail = lines[j];
          if (!detail) continue;
          const match = detail.match(
            new RegExp(`^(.+${FILE_EXT.source}):(\\d+):(\\d+)(.*)$`),
          );
          if (match) {
            const [, file, lineNum, col, msg] = match;
            if (file && lineNum && col) {
              errors.push({
                file: file.trim(),
                line: parseInt(lineNum, 10),
                column: parseInt(col, 10),
                message: msg?.trim() || "Transform error",
                severity: DiagnosticSeverity.Error,
              });
            }
          }
        }
      }
    }

    return errors;
  },
};

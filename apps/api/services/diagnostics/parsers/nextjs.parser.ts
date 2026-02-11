import { DiagnosticSeverity } from "../types.js";
import type { ErrorParser, ParsedError } from "../types.js";

const FILE_EXT = /\.(?:tsx?|jsx?|css|scss|json)/;

export const nextjsParser: ErrorParser = {
  name: "nextjs",

  canHandle(errorText: string, framework?: string): boolean {
    return (
      framework === "nextjs" ||
      errorText.includes("next build") ||
      errorText.includes("Next.js") ||
      errorText.includes("./app/") ||
      errorText.includes("./pages/") ||
      errorText.includes("Error: Failed to compile")
    );
  },

  parse(errorText: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = errorText.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const standaloneFile = line.match(
        new RegExp(`^\\.?\\/?(.+${FILE_EXT.source})$`),
      );
      if (standaloneFile?.[1] && i + 1 < lines.length) {
        const file = standaloneFile[1].replace(/^\.\//, "");
        const nextLine = lines[i + 1];
        if (nextLine) {
          const errorDetail = nextLine.match(/\((\d+):(\d+)\)\s*(.+)/);
          if (errorDetail) {
            const [, lineNum, col, message] = errorDetail;
            if (lineNum && col && message) {
              errors.push({
                file,
                line: parseInt(lineNum, 10),
                column: parseInt(col, 10),
                message: message.trim(),
                severity: DiagnosticSeverity.Error,
              });
              continue;
            }
          }
        }
      }

      const compileError = line.match(
        /Error:\s*Failed to compile/i,
      );
      if (compileError) {
        const fileRef = line.match(
          new RegExp(`(?:in|at)\\s+(.+${FILE_EXT.source})`),
        );
        errors.push({
          file: fileRef?.[1]?.replace(/^\.\//, ""),
          message: line.trim(),
          severity: DiagnosticSeverity.Error,
        });
        continue;
      }

      const moduleError = line.match(/Module not found:\s*(.+)/i);
      if (moduleError?.[1]) {
        const importRef = moduleError[1].match(/Can't resolve '(.+?)'/);
        errors.push({
          message: moduleError[1].trim(),
          severity: DiagnosticSeverity.Error,
          ...(importRef?.[1] && { code: importRef[1] }),
        });
        continue;
      }

      const inlineError = line.match(
        new RegExp(
          `^\\.?\\/?(.+${FILE_EXT.source}):(\\d+):(\\d+)`,
        ),
      );
      if (inlineError) {
        const [, file, lineNum, col] = inlineError;
        if (file && lineNum && col) {
          let message = "";
          for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
            const nextLine = lines[j];
            if (
              nextLine?.trim() &&
              !new RegExp(`^\\.?\\/?(.+${FILE_EXT.source})`).test(nextLine)
            ) {
              message += nextLine.trim() + " ";
            }
          }
          errors.push({
            file: file.replace(/^\.\//, ""),
            line: parseInt(lineNum, 10),
            column: parseInt(col, 10),
            message: message.trim() || "Build error",
            severity: DiagnosticSeverity.Error,
          });
        }
      }
    }

    return errors;
  },
};

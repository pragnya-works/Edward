import { DiagnosticSeverity } from "../types.js";
import type { ErrorParser, ParsedError } from "../types.js";

const FILE_EXT_PATTERN =
  /\.(?:tsx?|jsx?|css|scss|less|json|vue|svelte|mjs|cjs)/;

const STRUCTURED_PATTERNS = [
  /^(.+\.(?:tsx?|jsx?|css|scss|less|json)):(\d+):(\d+)\s*(.+)$/,
  /at\s+(.+\.(?:tsx?|jsx?)):(\d+):(\d+)/,
  /^(.+\.(?:tsx?|jsx?))\((\d+),(\d+)\)/,
];

export const genericParser: ErrorParser = {
  name: "generic",

  canHandle(): boolean {
    return true;
  },

  parse(errorText: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = errorText.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      const structured = parseStructuredLine(line);
      if (structured) {
        errors.push(structured);
        continue;
      }

      const moduleError = parseModuleError(line);
      if (moduleError) {
        errors.push(moduleError);
        continue;
      }

      const syntaxError = parseSyntaxError(line);
      if (syntaxError) {
        errors.push(syntaxError);
        continue;
      }

      const cssError = parseCssError(line);
      if (cssError) {
        errors.push(cssError);
        continue;
      }

      const jsonError = parseJsonError(line);
      if (jsonError) {
        errors.push(jsonError);
        continue;
      }
    }

    return errors;
  },
};

function parseStructuredLine(line: string): ParsedError | null {
  for (const pattern of STRUCTURED_PATTERNS) {
    const match = line.match(pattern);
    if (match?.[1]) {
      const file = match[1].replace(/^\.\//, "").trim();
      if (file.includes("node_modules")) continue;

      return {
        file,
        line: match[2] ? parseInt(match[2], 10) : undefined,
        column: match[3] ? parseInt(match[3], 10) : undefined,
        message: match[4]?.trim() || line.trim(),
        severity: DiagnosticSeverity.Error,
      };
    }
  }
  return null;
}

function parseModuleError(line: string): ParsedError | null {
  const match = line.match(
    /(?:Cannot find module|Module not found):\s*['"]?(.+?)['"]?\s*(?:from|$)/i,
  );
  if (match) {
    return { message: line.trim(), severity: DiagnosticSeverity.Error };
  }
  return null;
}

function parseSyntaxError(line: string): ParsedError | null {
  const match = line.match(/SyntaxError:\s*(.+)/i);
  if (match?.[1]) {
    return { message: match[1].trim(), severity: DiagnosticSeverity.Error };
  }
  return null;
}

function parseCssError(line: string): ParsedError | null {
  const cssMatch = line.match(/CssSyntaxError:\s*(.+)/i);
  if (cssMatch?.[1]) {
    const fileRef = line.match(
      new RegExp(`(.+${FILE_EXT_PATTERN.source})(?::(\\d+):(\\d+))?`),
    );
    return {
      file: fileRef?.[1]?.trim(),
      line: fileRef?.[2] ? parseInt(fileRef[2], 10) : undefined,
      column: fileRef?.[3] ? parseInt(fileRef[3], 10) : undefined,
      message: cssMatch[1].trim(),
      severity: DiagnosticSeverity.Error,
    };
  }

  const tailwindMatch = line.match(
    /The `(.+?)` (?:class|utility) does not exist/i,
  );
  if (tailwindMatch) {
    return { message: line.trim(), severity: DiagnosticSeverity.Error };
  }

  const postcssMatch = line.match(/Unknown at-rule\s+['"]?@(.+?)['"]?/i);
  if (postcssMatch) {
    return { message: line.trim(), severity: DiagnosticSeverity.Error };
  }

  return null;
}

function parseJsonError(line: string): ParsedError | null {
  const match = line.match(
    /(?:Unexpected token|JSON\.parse).*(?:in|at)\s+(.+\.json)/i,
  );
  if (match) {
    return {
      file: match[1]?.replace(/^\.\//, "").trim(),
      message: line.trim(),
      severity: DiagnosticSeverity.Error,
    };
  }
  return null;
}

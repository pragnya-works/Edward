import { DiagnosticCategory, DiagnosticSeverity } from "./types.js";

export function isErrorSeverity(severity: DiagnosticSeverity): boolean {
  return severity === DiagnosticSeverity.Error;
}

export function isWarningSeverity(severity: DiagnosticSeverity): boolean {
  return severity === DiagnosticSeverity.Warning;
}

const TS_CODE_TO_CATEGORY: Record<string, DiagnosticCategory> = {
  TS2307: DiagnosticCategory.MissingModule,
  TS2792: DiagnosticCategory.MissingModule,
  TS7016: DiagnosticCategory.MissingModule,
  TS2305: DiagnosticCategory.MissingExport,
  TS2614: DiagnosticCategory.MissingExport,
  TS1005: DiagnosticCategory.SyntaxError,
  TS1002: DiagnosticCategory.SyntaxError,
  TS1003: DiagnosticCategory.SyntaxError,
  TS1109: DiagnosticCategory.SyntaxError,
  TS1128: DiagnosticCategory.SyntaxError,
  TS1160: DiagnosticCategory.SyntaxError,
  TS1136: DiagnosticCategory.SyntaxError,
  TS1381: DiagnosticCategory.SyntaxError,
  TS2304: DiagnosticCategory.TypeError,
  TS2322: DiagnosticCategory.TypeError,
  TS2345: DiagnosticCategory.TypeError,
  TS2339: DiagnosticCategory.TypeError,
  TS2741: DiagnosticCategory.TypeError,
  TS2769: DiagnosticCategory.TypeError,
  TS2532: DiagnosticCategory.TypeError,
  TS2531: DiagnosticCategory.TypeError,
  TS2365: DiagnosticCategory.TypeError,
  TS2559: DiagnosticCategory.TypeError,
  TS2347: DiagnosticCategory.TypeError,
  TS18046: DiagnosticCategory.TypeError,
  TS18047: DiagnosticCategory.TypeError,
  TS18048: DiagnosticCategory.TypeError,
};

export function categorizeTsCode(code: string): DiagnosticCategory {
  return TS_CODE_TO_CATEGORY[code] ?? categorizeByTsPrefix(code);
}

function categorizeByTsPrefix(code: string): DiagnosticCategory {
  if (code.startsWith("TS1")) return DiagnosticCategory.SyntaxError;
  if (code.startsWith("TS2")) return DiagnosticCategory.TypeError;
  return DiagnosticCategory.Unknown;
}

export function categorizeByKeywords(text: string): DiagnosticCategory {
  const lower = text.toLowerCase();

  if (
    lower.includes("cannot find module") ||
    lower.includes("module not found") ||
    lower.includes("failed to resolve import") ||
    lower.includes("could not resolve")
  ) {
    return DiagnosticCategory.MissingModule;
  }

  if (
    lower.includes("has no exported member") ||
    lower.includes("has no default export") ||
    lower.includes("does not provide an export named")
  ) {
    return DiagnosticCategory.MissingExport;
  }

  if (
    lower.includes("syntaxerror") ||
    lower.includes("unexpected token") ||
    lower.includes("unexpected identifier") ||
    lower.includes("parsing error") ||
    lower.includes("unterminated string")
  ) {
    return DiagnosticCategory.SyntaxError;
  }

  if (
    lower.includes("type error") ||
    lower.includes("cannot find name") ||
    lower.includes("is not assignable to") ||
    lower.includes("does not exist on type")
  ) {
    return DiagnosticCategory.TypeError;
  }

  if (
    lower.includes("csssyntaxerror") ||
    lower.includes("unknown at-rule") ||
    lower.includes("postcss") ||
    lower.includes("tailwind") ||
    lower.includes(".css") ||
    lower.includes(".scss")
  ) {
    return DiagnosticCategory.CssError;
  }

  if (
    lower.includes("missing script") ||
    lower.includes("command not found") ||
    lower.includes("not found in package.json")
  ) {
    return DiagnosticCategory.BuildCommand;
  }

  if (
    lower.includes("config") ||
    lower.includes("plugin") ||
    lower.includes("loader")
  ) {
    return DiagnosticCategory.ConfigError;
  }

  return DiagnosticCategory.Unknown;
}

export function createDiagnosticId(
  file: string | undefined,
  line: number | undefined,
  message: string,
): string {
  const normalizedFile = file?.replace(/^\.\//, "") ?? "unknown";
  const lineStr = line?.toString() ?? "0";
  const msgHash = hashMessage(message);
  return `${normalizedFile}:${lineStr}:${msgHash}`;
}

function hashMessage(message: string): string {
  const normalized = message.toLowerCase().trim().slice(0, 100);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

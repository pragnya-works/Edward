import {
  getContainer,
  execCommand,
  CONTAINER_WORKDIR,
} from "../sandbox/docker.sandbox.js";
import { logger } from "../../utils/logger.js";
import { typescriptParser } from "./parsers/typescript.parser.js";
import { nextjsParser } from "./parsers/nextjs.parser.js";
import { viteParser } from "./parsers/vite.parser.js";
import { genericParser } from "./parsers/generic.parser.js";
import type {
  ErrorDiagnostic,
  ErrorCategory,
  EnrichmentResult,
  ParsedError,
  DiagnosticMethod,
} from "./types.js";

const PARSERS = [typescriptParser, nextjsParser, viteParser, genericParser];

const CONFIDENCE_SCORES: Record<DiagnosticMethod, number> = {
  parsed: 95,
  tsc: 90,
  inferred: 50,
  none: 0,
};

export async function enrichBuildError(
  sandboxId: string,
  rawError: string | undefined,
  containerId: string,
  framework?: string,
): Promise<EnrichmentResult> {
  if (!rawError) {
    return {
      rawError: "Unknown build error",
      structured: createUnknownDiagnostic("No error message provided"),
    };
  }

  let parsedErrors: ParsedError[] = [];
  let parserUsed: string | null = null;

  for (const parser of PARSERS) {
    if (parser.canHandle(rawError, framework)) {
      parsedErrors = parser.parse(rawError, framework);
      if (parsedErrors.length > 0) {
        parserUsed = parser.name;
        logger.debug(
          { sandboxId, parser: parser.name, errorCount: parsedErrors.length },
          "Parser successfully extracted errors",
        );
        break;
      }
    }
  }

  if (parsedErrors.length > 0 && parsedErrors.some((e) => e.file)) {
    const diagnostic = buildDiagnosticFromParsed(
      parsedErrors,
      rawError,
      "parsed",
    );
    logger.info(
      {
        sandboxId,
        parser: parserUsed,
        category: diagnostic.category,
        primaryFile: diagnostic.primaryFile,
      },
      "Error enrichment: Parsed successfully",
    );
    return { rawError, structured: diagnostic };
  }

  logger.debug({ sandboxId }, "No files from parsing, running tsc diagnostics");
  const tscErrors = await runTypescriptDiagnostics(containerId, sandboxId);
  if (tscErrors.length > 0 && tscErrors.some((e) => e.file)) {
    const diagnostic = buildDiagnosticFromParsed(tscErrors, rawError, "tsc");
    logger.info(
      {
        sandboxId,
        category: diagnostic.category,
        primaryFile: diagnostic.primaryFile,
      },
      "Error enrichment: tsc diagnostics successful",
    );
    return { rawError, structured: diagnostic };
  }

  logger.debug({ sandboxId }, "Running file inference heuristics");
  const inferredFiles = await inferCulpritFiles(
    containerId,
    sandboxId,
    rawError,
  );
  if (inferredFiles.length > 0) {
    const diagnostic = buildDiagnosticFromInferred(inferredFiles, rawError);
    logger.info(
      {
        sandboxId,
        inferredFiles,
        category: diagnostic.category,
      },
      "Error enrichment: File inference successful",
    );
    return { rawError, structured: diagnostic };
  }

  logger.warn({ sandboxId }, "Error enrichment: Could not identify any files");
  return {
    rawError,
    structured: createUnknownDiagnostic(rawError.slice(0, 500)),
  };
}

function buildDiagnosticFromParsed(
  errors: ParsedError[],
  rawError: string,
  method: DiagnosticMethod,
): ErrorDiagnostic {
  const filesWithErrors = errors.filter((e) => e.file);
  const allFiles = [...new Set(filesWithErrors.map((e) => e.file!))];
  const primaryFile = filesWithErrors[0]?.file;

  const lineNumbers = filesWithErrors
    .filter((e) => e.file && e.line)
    .map((e) => ({
      file: e.file!,
      line: e.line!,
      column: e.column,
    }));

  const category = categorizeErrors(errors, rawError);
  const errorCode = errors.find((e) => e.code)?.code;

  return {
    category,
    primaryFile,
    affectedFiles: allFiles,
    lineNumbers,
    errorCode,
    excerpt: rawError.slice(0, 500),
    diagnosticMethod: method,
    confidence: CONFIDENCE_SCORES[method],
  };
}

function buildDiagnosticFromInferred(
  files: string[],
  rawError: string,
): ErrorDiagnostic {
  return {
    category: categorizeByKeywords(rawError),
    primaryFile: files[0],
    affectedFiles: files,
    lineNumbers: [],
    excerpt: rawError.slice(0, 500),
    diagnosticMethod: "inferred",
    confidence: CONFIDENCE_SCORES.inferred,
  };
}

function createUnknownDiagnostic(rawError: string): ErrorDiagnostic {
  return {
    category: "unknown",
    affectedFiles: [],
    lineNumbers: [],
    excerpt: rawError.slice(0, 500),
    diagnosticMethod: "none",
    confidence: CONFIDENCE_SCORES.none,
  };
}

function categorizeErrors(
  errors: ParsedError[],
  rawError: string,
): ErrorCategory {
  const tsCode = errors.find((e) => e.code)?.code;
  if (tsCode) {
    if (["TS2307", "TS2792", "TS7016"].includes(tsCode)) return "import";
    if (tsCode.startsWith("TS1")) return "syntax";
    if (tsCode.startsWith("TS2")) return "type";
  }

  const messages = errors.map((e) => e.message.toLowerCase()).join(" ");
  return categorizeByKeywords(messages || rawError);
}

function categorizeByKeywords(text: string): ErrorCategory {
  const lower = text.toLowerCase();

  if (
    lower.includes("cannot find module") ||
    lower.includes("module not found") ||
    lower.includes("failed to resolve") ||
    lower.includes("could not resolve")
  ) {
    return "import";
  }

  if (
    lower.includes("syntaxerror") ||
    lower.includes("unexpected token") ||
    lower.includes("unexpected identifier")
  ) {
    return "syntax";
  }

  if (
    lower.includes("type error") ||
    lower.includes("cannot find name") ||
    lower.includes("property") ||
    lower.includes("does not exist")
  ) {
    return "type";
  }

  if (
    lower.includes("referenceerror") ||
    lower.includes("typeerror") ||
    lower.includes("is not a function") ||
    lower.includes("is not defined") ||
    lower.includes("undefined is not") ||
    lower.includes("null is not")
  ) {
    return "runtime";
  }

  if (
    lower.includes("config") ||
    lower.includes("plugin") ||
    lower.includes("loader")
  ) {
    return "buildConfig";
  }

  return "unknown";
}

async function runTypescriptDiagnostics(
  containerId: string,
  sandboxId: string,
): Promise<ParsedError[]> {
  try {
    const container = getContainer(containerId);

    const hasTsConfig = await execCommand(
      container,
      ["test", "-f", "tsconfig.json"],
      false,
      5000,
      undefined,
      CONTAINER_WORKDIR,
    );

    if (hasTsConfig.exitCode !== 0) {
      logger.debug({ sandboxId }, "No tsconfig.json, skipping tsc diagnostics");
      return [];
    }

    const result = await execCommand(
      container,
      ["sh", "-c", "pnpm tsc --noEmit 2>&1 | head -100"],
      false,
      60000,
      undefined,
      CONTAINER_WORKDIR,
    );

    if (result.exitCode === 0 || !result.stdout) {
      return [];
    }

    return typescriptParser.parse(result.stdout);
  } catch (error) {
    logger.warn({ error, sandboxId }, "TypeScript diagnostics failed");
    return [];
  }
}

async function inferCulpritFiles(
  containerId: string,
  sandboxId: string,
  rawError: string,
): Promise<string[]> {
  const container = getContainer(containerId);
  const suspectFiles: string[] = [];

  try {
    const moduleMatch = rawError.match(
      /(?:Cannot find module|Module not found):\s*['"](.+?)['"]/i,
    );
    if (moduleMatch) {
      const moduleName = moduleMatch[1];
      logger.debug({ sandboxId, moduleName }, "Searching for module imports");

      const grepResult = await execCommand(
        container,
        [
          "sh",
          "-c",
          `grep -r "from ['"]${moduleName}['"]" src/ 2>/dev/null | cut -d: -f1 | head -5`,
        ],
        false,
        10000,
        undefined,
        CONTAINER_WORKDIR,
      );

      if (grepResult.exitCode === 0 && grepResult.stdout) {
        const files = grepResult.stdout
          .split("\n")
          .filter((f) => f.trim().length > 0)
          .map((f) => f.trim());
        suspectFiles.push(...files);
      }
    }

    if (suspectFiles.length === 0) {
      logger.debug({ sandboxId }, "Checking recently modified files");
      const recentResult = await execCommand(
        container,
        [
          "sh",
          "-c",
          'find src/ -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \\) -mmin -30 2>/dev/null | head -10',
        ],
        false,
        10000,
        undefined,
        CONTAINER_WORKDIR,
      );

      if (recentResult.exitCode === 0 && recentResult.stdout) {
        const files = recentResult.stdout
          .split("\n")
          .filter((f) => f.trim().length > 0)
          .map((f) => f.trim());
        suspectFiles.push(...files);
      }
    }

    if (suspectFiles.length === 0) {
      logger.debug({ sandboxId }, "Checking entry points");
      const entryPoints = [
        "src/index.tsx",
        "src/index.ts",
        "src/main.tsx",
        "src/main.ts",
        "src/app/page.tsx",
        "src/app/layout.tsx",
      ];

      for (const entry of entryPoints) {
        const exists = await execCommand(
          container,
          ["test", "-f", entry],
          false,
          5000,
          undefined,
          CONTAINER_WORKDIR,
        );

        if (exists.exitCode === 0) {
          suspectFiles.push(entry);
        }
      }
    }

    return [...new Set(suspectFiles)].slice(0, 5);
  } catch (error) {
    logger.warn({ error, sandboxId }, "File inference failed");
    return [];
  }
}

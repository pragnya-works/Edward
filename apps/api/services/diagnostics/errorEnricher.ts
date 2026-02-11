import {
  getContainer,
  execCommand,
  CONTAINER_WORKDIR,
} from "../sandbox/docker.sandbox.js";
import { logger } from "../../utils/logger.js";
import { extractDiagnostics } from "./diagnostics.js";
import { typescriptParser } from "./parsers/typescript.parser.js";
import {
  DiagnosticMethod,
  DiagnosticCategory,
  DiagnosticSeverity,
} from "./types.js";
import type { Diagnostic, EnrichmentResult } from "./types.js";

const CONFIDENCE: Record<DiagnosticMethod, number> = {
  [DiagnosticMethod.Parsed]: 95,
  [DiagnosticMethod.Tsc]: 90,
  [DiagnosticMethod.Inferred]: 50,
  [DiagnosticMethod.None]: 0,
};

const PROJECT_DIRS = [
  "src/",
  "app/",
  "pages/",
  "components/",
  "lib/",
  "utils/",
  "hooks/",
  "styles/",
  "public/",
  ".",
];

export async function enrichBuildError(
  sandboxId: string,
  rawError: string | undefined,
  containerId: string,
  framework?: string,
): Promise<EnrichmentResult> {
  if (!rawError) {
    return {
      rawError: "Unknown build error",
      diagnostics: [],
      method: DiagnosticMethod.None,
      confidence: CONFIDENCE[DiagnosticMethod.None],
    };
  }

  const extraction = extractDiagnostics({ framework, errorLog: rawError });
  if (
    extraction.diagnostics.length > 0 &&
    extraction.diagnostics.some((d) => d.file)
  ) {
    logger.info(
      {
        sandboxId,
        count: extraction.diagnostics.length,
        method: DiagnosticMethod.Parsed,
      },
      "Error enrichment: parsed successfully",
    );
    return {
      rawError,
      diagnostics: extraction.diagnostics,
      method: DiagnosticMethod.Parsed,
      confidence: CONFIDENCE[DiagnosticMethod.Parsed],
    };
  }

  logger.debug({ sandboxId }, "No files from parsing, running tsc diagnostics");
  const tscDiagnostics = await runTscDiagnostics(
    containerId,
    sandboxId,
    framework,
  );
  if (tscDiagnostics.length > 0 && tscDiagnostics.some((d) => d.file)) {
    logger.info(
      { sandboxId, count: tscDiagnostics.length, method: DiagnosticMethod.Tsc },
      "Error enrichment: tsc diagnostics successful",
    );
    return {
      rawError,
      diagnostics: tscDiagnostics,
      method: DiagnosticMethod.Tsc,
      confidence: CONFIDENCE[DiagnosticMethod.Tsc],
    };
  }

  logger.debug({ sandboxId }, "Running file inference heuristics");
  const inferredDiagnostics = await inferFromFiles(
    containerId,
    sandboxId,
    rawError,
  );
  if (inferredDiagnostics.length > 0) {
    logger.info(
      {
        sandboxId,
        count: inferredDiagnostics.length,
        method: DiagnosticMethod.Inferred,
      },
      "Error enrichment: file inference successful",
    );
    return {
      rawError,
      diagnostics: inferredDiagnostics,
      method: DiagnosticMethod.Inferred,
      confidence: CONFIDENCE[DiagnosticMethod.Inferred],
    };
  }

  logger.warn({ sandboxId }, "Error enrichment: could not identify any files");
  const fallback = extractDiagnostics({ framework, errorLog: rawError });
  return {
    rawError,
    diagnostics: fallback.diagnostics,
    method: DiagnosticMethod.None,
    confidence: CONFIDENCE[DiagnosticMethod.None],
  };
}

async function runTscDiagnostics(
  containerId: string,
  sandboxId: string,
  framework?: string,
): Promise<Diagnostic[]> {
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
      ["sh", "-c", "npx tsc --noEmit 2>&1 | head -100"],
      false,
      60000,
      undefined,
      CONTAINER_WORKDIR,
    );

    if (result.exitCode === 0 || !result.stdout) return [];

    const parsed = typescriptParser.parse(result.stdout);
    if (parsed.length === 0) return [];

    const extraction = extractDiagnostics({
      framework,
      errorLog: result.stdout,
    });
    return extraction.diagnostics;
  } catch (error) {
    logger.warn({ error, sandboxId }, "TypeScript diagnostics failed");
    return [];
  }
}

async function inferFromFiles(
  containerId: string,
  sandboxId: string,
  rawError: string,
): Promise<Diagnostic[]> {
  const container = getContainer(containerId);
  const suspectFiles: string[] = [];

  try {
    const moduleMatch = rawError.match(
      /(?:Cannot find module|Module not found):\s*['"](.+?)['"]/i,
    );
    if (moduleMatch?.[1]) {
      const moduleName = moduleMatch[1];
      const sanitizedModuleName = moduleName.replace(/[^a-zA-Z0-9\-_./@]/g, "");

      logger.debug(
        { sandboxId, moduleName: sanitizedModuleName },
        "Searching for module imports",
      );

      for (const dir of PROJECT_DIRS) {
        const grepResult = await execCommand(
          container,
          [
            "sh",
            "-c",
            `grep -rl "from [\\"']${sanitizedModuleName}[\\"']" ${dir} 2>/dev/null | head -5`,
          ],
          false,
          10000,
          undefined,
          CONTAINER_WORKDIR,
        );

        if (grepResult.exitCode === 0 && grepResult.stdout?.trim()) {
          const files = grepResult.stdout
            .split("\n")
            .filter((f) => f.trim().length > 0)
            .map((f) => f.trim());
          suspectFiles.push(...files);
          break;
        }
      }
    }

    if (suspectFiles.length === 0) {
      logger.debug({ sandboxId }, "Checking recently modified files");
      const extensions =
        '"*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.css" -o -name "*.scss"';
      const dirs = PROJECT_DIRS.slice(0, 5).join(" ");
      const recentResult = await execCommand(
        container,
        [
          "sh",
          "-c",
          `find ${dirs} -type f \\( -name ${extensions} \\) -mmin -60 2>/dev/null | head -10`,
        ],
        false,
        10000,
        undefined,
        CONTAINER_WORKDIR,
      );

      if (recentResult.exitCode === 0 && recentResult.stdout?.trim()) {
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
        "src/App.tsx",
        "src/App.ts",
        "app/page.tsx",
        "app/layout.tsx",
        "pages/index.tsx",
        "pages/_app.tsx",
        "index.html",
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

    const uniqueFiles = [...new Set(suspectFiles)].slice(0, 5);
    if (uniqueFiles.length === 0) return [];

    return uniqueFiles.map((file) => ({
      id: `inferred:${file}`,
      category: DiagnosticCategory.Unknown,
      severity: DiagnosticSeverity.Error,
      file,
      message: rawError.slice(0, 200),
    }));
  } catch (error) {
    logger.warn({ error, sandboxId }, "File inference failed");
    return [];
  }
}

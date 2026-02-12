import { logger } from "../../utils/logger.js";
import type { BuildError, BuildErrorReport, FileCache } from "./types.js";
import {
  parseErrors,
  categorizeError,
  extractTarget,
  calculateConfidence,
  detectStage,
} from "./parser.js";
import {
  readFileWithCache,
  readFileSnippet,
  extractImportChain,
  findRelatedFiles,
  loadProjectContext,
} from "./context.js";
import {
  findRootCause,
  groupRelatedErrors,
  generateSuggestion,
} from "./analyzer.js";

function compressBuildOutput(
  output: string,
  maxBytes: number = 8000,
  headBytes: number = 2000,
): string {
  if (!output) return "";
  const buf = Buffer.from(output, "utf8");
  if (buf.byteLength <= maxBytes) return output;

  const head = buf.subarray(0, Math.min(headBytes, buf.byteLength)).toString(
    "utf8",
  );
  const tail = buf
    .subarray(Math.max(0, buf.byteLength - (maxBytes - headBytes)))
    .toString("utf8");

  return [
    head,
    "\n... (output truncated) ...\n",
    tail,
  ].join("");
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
}

function getFromSnapshot(
  snapshot: Map<string, string>,
  filePath: string,
): string | undefined {
  const normalized = normalizePath(filePath);
  return (
    snapshot.get(filePath) ??
    snapshot.get(normalized) ??
    snapshot.get(`./${normalized}`)
  );
}

async function findRelatedFilesInSnapshot(
  snapshot: Map<string, string>,
  target: string | undefined,
  errorFile: string,
): Promise<Array<{ path: string; reason: string; snippet?: string }>> {
  if (!target) return [];

  const related: Array<{ path: string; reason: string; snippet?: string }> = [];
  const normalizedErrorFile = normalizePath(errorFile);

  for (const [path, content] of snapshot) {
    const normalizedPath = normalizePath(path);
    if (!content) continue;
    if (normalizedPath === normalizedErrorFile) continue;
    if (normalizedPath.includes("node_modules")) continue;

    const idx = content.indexOf(target);
    if (idx === -1) continue;

    const line = content.substring(0, idx).split("\n").length;
    const snippet = line > 0 ? await readFileSnippet(content, line, 3) : undefined;
    related.push({ path: normalizedPath, reason: `references '${target}'`, snippet });

    if (related.length >= 3) break;
  }

  return related;
}

function extractImportChainInSnapshot(
  content: string,
  filePath: string,
  target: string | undefined,
): Array<{ file: string; line: number; importPath: string }> {
  if (!content || !target) return [];

  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const importRegex = new RegExp(
    `(?:import|require|from)\\s+['"]([^'"]*${escaped}[^'"]*)['"]`,
    "gi",
  );

  const results: Array<{ file: string; line: number; importPath: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (!importPath) continue;
    const line = content.substring(0, match.index).split("\n").length;
    results.push({ file: normalizePath(filePath), line, importPath });
    if (results.length >= 5) break;
  }

  return results;
}

export async function createErrorReport(
  containerId: string,
  rawOutput: string,
  framework?: string,
  command: string = "npm run build",
  options?: {
    fileContents?: Map<string, string>;
  },
): Promise<BuildErrorReport> {
  const startTime = Date.now();
  const cache = new Map<string, FileCache>();

  const snapshot = options?.fileContents;

  const [parsedErrors, projectContext] = await Promise.all([
    Promise.resolve(parseErrors(rawOutput)),
    snapshot
      ? Promise.resolve({
          packageJson: (() => {
            const content = getFromSnapshot(snapshot, "package.json");
            if (!content) return undefined;
            try {
              return JSON.parse(content) as Record<string, unknown>;
            } catch {
              return undefined;
            }
          })(),
          tsConfig: (() => {
            const content = getFromSnapshot(snapshot, "tsconfig.json");
            if (!content) return undefined;
            try {
              return JSON.parse(content) as Record<string, unknown>;
            } catch {
              return undefined;
            }
          })(),
        })
      : loadProjectContext(containerId, cache),
  ]);

  const totalErrorCount = parsedErrors.length;
  const stage = detectStage(rawOutput);

  const errorPromises = parsedErrors.slice(0, 5).map(async (parsed) => {
    const type = categorizeError(parsed.message, parsed.code).type;
    const target = extractTarget(type, parsed.message);

    const shouldReadFile = parsed.file !== "unknown";
    let content = "";
    let relatedFiles: Array<{ path: string; reason: string; snippet?: string }> = [];
    let importChain: Array<{ file: string; line: number; importPath: string }> = [];

    if (snapshot) {
      const filePath = normalizePath(parsed.file);
      content = shouldReadFile ? getFromSnapshot(snapshot, filePath) || "" : "";
      relatedFiles = await findRelatedFilesInSnapshot(snapshot, target, filePath);
      importChain = shouldReadFile
        ? extractImportChainInSnapshot(content, filePath, target)
        : [];
    } else {
      const tuple = (await Promise.all([
        shouldReadFile ? readFileWithCache(containerId, parsed.file, cache) : "",
        findRelatedFiles(containerId, target, parsed.file, cache),
        shouldReadFile
          ? extractImportChain(containerId, parsed.file, target, cache)
          : Promise.resolve([]),
      ])) as [
        string,
        Array<{ path: string; reason: string; snippet?: string }>,
        Array<{ file: string; line: number; importPath: string }>,
      ];

      [content, relatedFiles, importChain] = tuple;
    }

    const snippet =
      shouldReadFile && parsed.line > 0
        ? await readFileSnippet(content, parsed.line)
        : "";

    const confidence = calculateConfidence(parsed, !!snippet);

    const error: BuildError = {
      id: `${parsed.file}:${parsed.line}:${parsed.message.slice(0, 30)}`,
      headline: `${type} error in ${parsed.file}`,
      type,
      severity: parsed.severity,
      stage: parsed.stage,
      confidence,
      error: {
        file: parsed.file,
        line: parsed.line,
        column: parsed.column,
        message: parsed.message,
        code: parsed.code,
        snippet,
        fullContent: content || undefined,
        target,
      },
      context: {
        packageJson: projectContext.packageJson,
        tsConfig: projectContext.tsConfig,
        importChain: importChain.length > 0 ? importChain : undefined,
      },
      relatedErrors: [],
      relatedFiles,
      timestamp: new Date().toISOString(),
    };

    error.suggestion = generateSuggestion(error, projectContext);
    return error;
  });

  const allErrors = await Promise.all(errorPromises);
  const errors = groupRelatedErrors(allErrors);

  const criticalCount = errors.filter((e) => e.severity === "critical").length;
  const errorCount = errors.filter((e) => e.severity === "error").length;
  const warningCount = errors.filter((e) => e.severity === "warning").length;
  const uniqueTypes = [...new Set(errors.map((e) => e.type))];

  const rootCause = findRootCause(errors);
  const headline = rootCause
    ? `Build failed: ${rootCause.type} - ${rootCause.error.message.split("\n")[0]?.slice(0, 100) || rootCause.type}`
    : `Build failed with ${totalErrorCount} error${totalErrorCount === 1 ? "" : "s"}`;

  logger.info(
    {
      totalErrors: totalErrorCount,
      processed: errors.length,
      critical: criticalCount,
      errors: errorCount,
      warnings: warningCount,
      types: uniqueTypes,
      stage,
      duration: Date.now() - startTime,
    },
    "Error report created",
  );

  return {
    failed: true,
    headline,
    summary: {
      totalErrors: totalErrorCount,
      criticalCount,
      errorCount,
      warningCount,
      uniqueTypes,
      stage,
    },
    errors,
    rootCause,
    framework,
    command,
    rawOutput: compressBuildOutput(rawOutput, 8000, 2000),
    processedAt: new Date().toISOString(),
    duration: Date.now() - startTime,
  };
}

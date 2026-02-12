import {
  execCommand,
  getContainer,
  CONTAINER_WORKDIR,
} from "../sandbox/docker.sandbox.js";
import { logger } from "../../utils/logger.js";
import type { FileCache } from "./types.js";
import path from "node:path";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 100;

function isExpired(cache: FileCache): boolean {
  return Date.now() - cache.timestamp > CACHE_TTL_MS;
}

function pruneCache(cache: Map<string, FileCache>): void {
  if (cache.size > MAX_CACHE_ENTRIES) {
    const entries = Array.from(cache.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(0, MAX_CACHE_ENTRIES);
    cache.clear();
    entries.forEach(([key, value]) => cache.set(key, value));
  }
}

export async function readFileWithCache(
  containerId: string,
  filePath: string,
  cache: Map<string, FileCache>,
): Promise<string> {
  const cached = cache.get(filePath);
  if (cached && !isExpired(cached)) return cached.content;
  if (cached && isExpired(cached)) cache.delete(filePath);

  try {
    const container = getContainer(containerId);
    const result = await execCommand(
      container,
      ["cat", filePath],
      false,
      10000,
      undefined,
      CONTAINER_WORKDIR,
    );

    if (result.exitCode === 0 && result.stdout) {
      cache.set(filePath, { content: result.stdout, timestamp: Date.now() });
      pruneCache(cache);
      return result.stdout;
    }
  } catch (err) {
    logger.debug({ error: err, file: filePath }, "Failed to read file");
  }

  return "";
}

export async function readFileSnippet(
  content: string,
  errorLine: number,
  contextLines: number = 5,
): Promise<string> {
  if (!content) return "File not available";

  const lines = content.split("\n");
  const startLine = Math.max(0, errorLine - contextLines - 1);
  const endLine = Math.min(lines.length, errorLine + contextLines);

  return lines
    .slice(startLine, endLine)
    .map((line, idx) => {
      const lineNum = startLine + idx + 1;
      const marker = lineNum === errorLine ? ">" : " ";
      return `${marker} ${lineNum.toString().padStart(3)} | ${line}`;
    })
    .join("\n");
}

export async function extractImportChain(
  containerId: string,
  entryFile: string,
  target: string | undefined,
  cache: Map<string, FileCache>,
): Promise<Array<{ file: string; line: number; importPath: string }>> {
  if (!target) return [];

  const chain: Array<{ file: string; line: number; importPath: string }> = [];
  const visited = new Set<string>();
  const queue: string[] = [entryFile];

  while (queue.length > 0 && chain.length < 5) {
    const currentFile = queue.shift()!;
    if (visited.has(currentFile)) continue;
    visited.add(currentFile);

    const content = await readFileWithCache(containerId, currentFile, cache);
    if (!content) continue;

    const importRegex = new RegExp(
      `(?:import|require|from)\\s+['"]([^'"]*${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^'"]*)['"]`,
      "gi",
    );
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (!importPath) continue;

      const line = content.substring(0, match.index).split("\n").length;
      chain.push({ file: currentFile, line, importPath });

      if (!importPath.startsWith(".")) continue;

      const baseDir = path.posix.dirname(currentFile);
      const joined = path.posix.normalize(path.posix.join(baseDir, importPath));

      const hasExt = /\.[a-zA-Z0-9]+$/.test(joined);
      const candidates = hasExt
        ? [joined]
        : [
            `${joined}.ts`,
            `${joined}.tsx`,
            `${joined}.js`,
            `${joined}.jsx`,
            path.posix.join(joined, "index.ts"),
            path.posix.join(joined, "index.tsx"),
            path.posix.join(joined, "index.js"),
            path.posix.join(joined, "index.jsx"),
          ];

      for (const candidate of candidates) {
        if (!candidate.includes("node_modules") && !visited.has(candidate)) {
          queue.push(candidate);
          break;
        }
      }
    }
  }

  return chain;
}

export async function findRelatedFiles(
  containerId: string,
  target: string | undefined,
  errorFile: string,
  cache: Map<string, FileCache>,
): Promise<Array<{ path: string; reason: string; snippet?: string }>> {
  if (!target) return [];

  const related: Array<{ path: string; reason: string; snippet?: string }> = [];

  try {
    const container = getContainer(containerId);
    const baseArgs = ["-rlF", "--", target, "."] as const;
    const excludeArgs = [
      "--exclude-dir=node_modules",
      "--exclude-dir=.next",
      "--exclude-dir=dist",
      "--exclude-dir=build",
      "--exclude-dir=coverage",
    ] as const;

    let grepResult = await execCommand(
      container,
      ["grep", ...excludeArgs, ...baseArgs],
      false,
      10000,
      undefined,
      CONTAINER_WORKDIR,
    );

    if (grepResult.exitCode === 2) {
      grepResult = await execCommand(
        container,
        ["grep", ...baseArgs],
        false,
        10000,
        undefined,
        CONTAINER_WORKDIR,
      );
    }
    if (grepResult.exitCode !== 0 && grepResult.exitCode !== 1) {
      logger.debug({ error: grepResult.stderr, target }, "Grep command failed unexpectedly");
      return [];
    }
    if (grepResult.exitCode === 0 && grepResult.stdout) {
      const files = grepResult.stdout
        .split("\n")
        .filter((f) => f && f !== errorFile && !f.includes("node_modules"))
        .slice(0, 3);

      for (const file of files) {
        const content = await readFileWithCache(containerId, file, cache);
        const lines = content.split("\n");
        const importLine = lines.findIndex((l) => l.includes(target));
        const snippet =
          importLine >= 0
            ? await readFileSnippet(content, importLine + 1, 3)
            : undefined;

        related.push({ path: file, reason: `references '${target}'`, snippet });
      }
    }
  } catch (err) {
    logger.debug({ error: err, target }, "Failed to find related files");
  }

  return related;
}

export async function loadProjectContext(
  containerId: string,
  cache: Map<string, FileCache>,
): Promise<{
  packageJson?: Record<string, unknown>;
  tsConfig?: Record<string, unknown>;
}> {
  const [packageContent, tsConfigContent] = await Promise.all([
    readFileWithCache(containerId, "package.json", cache),
    readFileWithCache(containerId, "tsconfig.json", cache),
  ]);

  const context: {
    packageJson?: Record<string, unknown>;
    tsConfig?: Record<string, unknown>;
  } = {};

  if (packageContent) {
    try {
      context.packageJson = JSON.parse(packageContent);
    } catch {
      logger.debug("Failed to parse package.json");
    }
  }

  if (tsConfigContent) {
    try {
      context.tsConfig = JSON.parse(tsConfigContent);
    } catch {
      logger.debug("Failed to parse tsconfig.json");
    }
  }

  return context;
}

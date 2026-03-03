import fs from "node:fs";
import path from "node:path";

export const EXCLUDED_DIRS = new Set(["node_modules", "dist", "coverage", ".tmp-jscpd"]);

function isTsSourceFile(fileName) {
  return fileName.endsWith(".ts") || fileName.endsWith(".tsx");
}

export function isTestFile(relPath) {
  return relPath.endsWith(".test.ts") || relPath.endsWith(".spec.ts");
}

export function walkTsFiles(rootDir) {
  const out = [];

  const walk = (currentDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) {
          continue;
        }
        walk(absPath);
        continue;
      }

      if (!isTsSourceFile(entry.name)) {
        continue;
      }

      const relPath = toPosix(path.relative(rootDir, absPath));
      out.push({ absPath, relPath });
    }
  };

  walk(rootDir);
  return out;
}

function toPosix(value) {
  return value.replaceAll(path.sep, "/");
}

function stripKnownJsExt(specifier) {
  return specifier.replace(/\.(mjs|cjs|js|jsx|ts|tsx)$/u, "");
}

function candidatePaths(rawPath) {
  const base = stripKnownJsExt(rawPath);
  return [
    rawPath,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
}

export function parseImportSpecifiers(fileText) {
  const deps = new Set();

  for (const match of fileText.matchAll(/from\s+['"]([^'"\n]+)['"]/gu)) {
    deps.add(match[1]);
  }

  for (const match of fileText.matchAll(/import\s+['"]([^'"\n]+)['"]/gu)) {
    deps.add(match[1]);
  }

  return [...deps];
}

export function resolveInternalImport(fromRelPath, specifier, fileRelSet) {
  let joined;

  if (specifier.startsWith(".")) {
    const baseDir = path.posix.dirname(fromRelPath);
    joined = path.posix.normalize(path.posix.join(baseDir, specifier));
  } else if (specifier.startsWith("@/")) {
    joined = path.posix.normalize(specifier.slice(2));
  } else {
    return null;
  }

  for (const candidate of candidatePaths(joined)) {
    if (fileRelSet.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function buildImportGraph(rootDir, { includeTests = false } = {}) {
  const all = walkTsFiles(rootDir);
  const files = includeTests ? all : all.filter((f) => !isTestFile(f.relPath));

  const fileRelSet = new Set(files.map((f) => f.relPath));
  const inbound = new Map();
  const outbound = new Map();
  const edges = [];

  for (const file of files) {
    inbound.set(file.relPath, 0);
    outbound.set(file.relPath, 0);
  }

  for (const file of files) {
    const sourceText = fs.readFileSync(file.absPath, "utf8");
    const specs = parseImportSpecifiers(sourceText);
    const seenTargets = new Set();

    for (const spec of specs) {
      const target = resolveInternalImport(file.relPath, spec, fileRelSet);
      if (!target || seenTargets.has(target)) {
        continue;
      }

      seenTargets.add(target);
      edges.push({ from: file.relPath, to: target, specifier: spec });
      outbound.set(file.relPath, (outbound.get(file.relPath) ?? 0) + 1);
      inbound.set(target, (inbound.get(target) ?? 0) + 1);
    }
  }

  return {
    files,
    edges,
    inbound,
    outbound,
  };
}

export function countLines(absPath) {
  const text = fs.readFileSync(absPath, "utf8");
  return text.split(/\r?\n/u).length;
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function sortByCountDesc(entries) {
  return [...entries].sort((a, b) => b[1] - a[1]);
}

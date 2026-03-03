import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { isTestFile, walkTsFiles } from "./_imports.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const MAX_FUNCTION_LINES = 80;
const EXCEPTIONS_PATH = path.resolve(
  API_ROOT,
  "docs/adrs/adr-0001-function-length-exceptions.json",
);

function loadExceptions() {
  if (!fs.existsSync(EXCEPTIONS_PATH)) {
    throw new Error(
      `Missing function-length exceptions catalog: ${path.relative(API_ROOT, EXCEPTIONS_PATH)}`,
    );
  }

  const parsed = JSON.parse(fs.readFileSync(EXCEPTIONS_PATH, "utf8"));
  const entries = Array.isArray(parsed.exceptions) ? parsed.exceptions : [];
  const map = new Map();
  const invalid = [];
  const duplicateKeys = [];

  for (const item of entries) {
    const key = typeof item?.key === "string" ? item.key.trim() : "";
    const rationale =
      typeof item?.rationale === "string" ? item.rationale.trim() : "";
    if (!key || rationale.length < 20) {
      invalid.push(item);
      continue;
    }
    if (map.has(key)) {
      duplicateKeys.push(key);
      continue;
    }
    map.set(key, item);
  }

  if (invalid.length > 0) {
    throw new Error(
      `Invalid ADR exception entries: ${invalid.length}. Each entry requires a non-empty key and rationale (>=20 chars).`,
    );
  }
  if (duplicateKeys.length > 0) {
    throw new Error(
      `Duplicate ADR exception keys found: ${[...new Set(duplicateKeys)].join(", ")}`,
    );
  }

  return map;
}

function resolveFunctionName(node, sourceFile) {
  if ("name" in node && node.name) {
    if (ts.isIdentifier(node.name)) {
      return node.name.text;
    }
    return node.name.getText(sourceFile);
  }

  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent)) {
    return parent.name.getText(sourceFile);
  }

  return "<anonymous>";
}

function toFunctionKey(relPath, fnName, startLine) {
  if (fnName === "<anonymous>") {
    return `${relPath}#L${startLine}`;
  }
  return `${relPath}#${fnName}`;
}

function collectLongFunctions() {
  const allFiles = walkTsFiles(API_ROOT)
    .filter((file) => !isTestFile(file.relPath))
    .sort((a, b) => a.relPath.localeCompare(b.relPath));
  const violations = [];

  for (const file of allFiles) {
    const source = fs.readFileSync(file.absPath, "utf8");
    const sourceFile = ts.createSourceFile(
      file.absPath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const maybeRecord = (node) => {
      if (!("body" in node) || !node.body) {
        return;
      }
      const start = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
      const lines = end.line - start.line + 1;
      if (lines <= MAX_FUNCTION_LINES) {
        return;
      }

      const fnName = resolveFunctionName(node, sourceFile);
      const startLine = start.line + 1;
      const endLine = end.line + 1;
      const key = toFunctionKey(file.relPath, fnName, startLine);

      violations.push({
        key,
        file: file.relPath,
        fnName,
        startLine,
        endLine,
        lines,
      });
    };

    const visit = (node) => {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
        maybeRecord(node);
      } else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        maybeRecord(node);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return violations;
}

const exceptions = loadExceptions();
const longFunctions = collectLongFunctions();
const longFunctionKeys = new Set(longFunctions.map((fn) => fn.key));

const missingJustification = longFunctions.filter((fn) => !exceptions.has(fn.key));
const staleExceptions = [...exceptions.keys()]
  .filter((key) => !longFunctionKeys.has(key))
  .sort();

if (missingJustification.length > 0 || staleExceptions.length > 0) {
  if (missingJustification.length > 0) {
    console.error(
      `Function length violations (>${MAX_FUNCTION_LINES} lines) missing ADR justification:`,
    );
    for (const item of missingJustification) {
      console.error(
        `- ${item.key} (${item.lines} lines @ ${item.file}:${item.startLine})`,
      );
    }
    console.error(`Total missing justifications: ${missingJustification.length}`);
  }

  if (staleExceptions.length > 0) {
    console.error("Stale ADR exceptions (function no longer exceeds limit):");
    for (const key of staleExceptions) {
      console.error(`- ${key}`);
    }
    console.error(`Total stale exceptions: ${staleExceptions.length}`);
  }

  process.exit(1);
}

console.log(
  `Function length check passed (${longFunctions.length} functions > ${MAX_FUNCTION_LINES} lines, all ADR-justified).`,
);

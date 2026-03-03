import fs from "node:fs";
import path from "node:path";
import { countLines, ensureDir, isTestFile, walkTsFiles } from "./_imports.mjs";
import { inferLayerTag } from "./_architecture.mjs";

const API_ROOT = process.cwd();
const REPO_ROOT = path.resolve(API_ROOT, "../..");
const OUT_PATH = path.resolve(REPO_ROOT, "plans/apps-api-file-audit.csv");

const DUPLICATE_TARGETS = [
  "lib/llm/tokens/geminiCounter.ts",
  "lib/llm/tokens/openaiCounter.ts",
  "controllers/chat/query/run.controller.ts",
  "controllers/chat/query/sandbox.controller.ts",
  "controllers/chat/query/build.controller.ts",
  "controllers/chat/query/history.controller.ts",
  "services/sandbox/write/buffer.ts",
  "services/sandbox/read/backup.ts",
  "services/chat/access.service.ts",
  "services/previewRouting/subdomainUpdate.service.ts",
  "services/packages/packageSpec.ts",
  "services/github/sync.service.ts",
];

function inferLayer(relPath) {
  const tag = inferLayerTag(relPath);
  return tag ?? "unknown";
}

function inferDomain(relPath) {
  const [top, second] = relPath.split("/");
  if (!second) return top;
  if (top === "controllers") {
    return second;
  }
  if (top === "services") {
    return second;
  }
  if (top === "lib") {
    return `lib/${second}`;
  }
  return `${top}/${second}`;
}

function inferStatus(relPath, lineCount) {
  if (isTestFile(relPath)) {
    return { status: "keep", reason: "test coverage file" };
  }

  if (lineCount > 350) {
    return { status: "split", reason: `high complexity (${lineCount} lines)` };
  }

  if (DUPLICATE_TARGETS.includes(relPath)) {
    return { status: "merge", reason: "duplicate logic hotspot" };
  }

  return { status: "keep", reason: "no structural issue detected" };
}

function csvEscape(value) {
  const raw = String(value ?? "");
  if (/[",\n]/u.test(raw)) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

const tsFiles = walkTsFiles(API_ROOT).sort((a, b) => a.relPath.localeCompare(b.relPath));
const rows = tsFiles.map((file) => {
  const lineCount = countLines(file.absPath);
  const { status, reason } = inferStatus(file.relPath, lineCount);

  return {
    path: file.relPath,
    layer: inferLayer(file.relPath),
    domain: inferDomain(file.relPath),
    owner: "TBD",
    status,
    reason,
    lines: lineCount,
  };
});

const headers = ["path", "layer", "domain", "owner", "status", "reason", "lines"];
const lines = [headers.join(",")];
for (const row of rows) {
  lines.push(headers.map((header) => csvEscape(row[header])).join(","));
}

ensureDir(path.dirname(OUT_PATH));
fs.writeFileSync(OUT_PATH, `${lines.join("\n")}\n`, "utf8");

console.log(`Audit CSV written: ${path.relative(REPO_ROOT, OUT_PATH)} (${rows.length} rows)`);

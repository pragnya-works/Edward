import fs from "node:fs";
import path from "node:path";

const API_ROOT = process.cwd();
const COVERAGE_JSON = path.join(API_ROOT, "coverage", "coverage-final.json");

const MIN_GLOBAL_STATEMENTS = 70;
const MIN_CRITICAL_BRANCH = 80;

const CRITICAL_PATH_FILES = [
  "server.http.ts",
  "queue.worker.ts",
  "services/runs/agent-run-worker/processor.helpers.ts",
  "services/runs/agent-run-worker/processor.events.ts",
  "services/runs/agent-run-worker/processor.finalize.ts",
  "services/runs/agent-run-worker/processor.session.ts",
  "services/sandbox/state.service.ts",
];

function countMetric(entry, kind) {
  if (kind === "statements") {
    const values = Object.values(entry.s ?? {});
    return {
      total: values.length,
      hit: values.filter((value) => value > 0).length,
    };
  }

  if (kind === "branches") {
    const buckets = Object.values(entry.b ?? {});
    let total = 0;
    let hit = 0;
    for (const bucket of buckets) {
      total += bucket.length;
      hit += bucket.filter((value) => value > 0).length;
    }
    return { total, hit };
  }

  throw new Error(`Unsupported metric kind: ${kind}`);
}

function percentage(hit, total) {
  if (total === 0) {
    return 100;
  }
  return Number(((hit / total) * 100).toFixed(2));
}

if (!fs.existsSync(COVERAGE_JSON)) {
  console.error(`Coverage report not found at ${COVERAGE_JSON}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(COVERAGE_JSON, "utf8"));
const byRelPath = new Map();
for (const [absPath, entry] of Object.entries(raw)) {
  const relPath = path.relative(API_ROOT, absPath).replaceAll("\\", "/");
  byRelPath.set(relPath, entry);
}

let globalStatementsHit = 0;
let globalStatementsTotal = 0;

for (const entry of Object.values(raw)) {
  const { total, hit } = countMetric(entry, "statements");
  globalStatementsTotal += total;
  globalStatementsHit += hit;
}

const globalStatementsPct = percentage(globalStatementsHit, globalStatementsTotal);
const failures = [];

if (globalStatementsPct < MIN_GLOBAL_STATEMENTS) {
  failures.push(
    `Global statements coverage ${globalStatementsPct}% is below ${MIN_GLOBAL_STATEMENTS}%`,
  );
}

for (const relPath of CRITICAL_PATH_FILES) {
  const entry = byRelPath.get(relPath);
  if (!entry) {
    failures.push(`Missing coverage entry for critical file: ${relPath}`);
    continue;
  }
  const branch = countMetric(entry, "branches");
  const branchPct = percentage(branch.hit, branch.total);
  if (branchPct < MIN_CRITICAL_BRANCH) {
    failures.push(
      `Critical-path branch coverage ${branchPct}% is below ${MIN_CRITICAL_BRANCH}% for ${relPath}`,
    );
  }
}

console.log(`Coverage check: global statements ${globalStatementsPct}%`);
for (const relPath of CRITICAL_PATH_FILES) {
  const entry = byRelPath.get(relPath);
  if (!entry) continue;
  const branch = countMetric(entry, "branches");
  const branchPct = percentage(branch.hit, branch.total);
  console.log(`- critical branches ${branchPct}% :: ${relPath}`);
}

if (failures.length > 0) {
  console.error("Coverage quality gate failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

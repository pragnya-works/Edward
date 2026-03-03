import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  buildImportGraph,
  countLines,
  EXCLUDED_DIRS,
  ensureDir,
  isTestFile,
  sortByCountDesc,
  walkTsFiles,
} from "./_imports.mjs";

const API_ROOT = process.cwd();
const REPO_ROOT = path.resolve(API_ROOT, "../..");
const OUT_DIR = path.resolve(REPO_ROOT, "plans/baselines/apps-api");
const OUT_JSON = path.join(OUT_DIR, "baseline.json");
const OUT_MD = path.join(OUT_DIR, "baseline.md");
const DUP_DIR = path.join(API_ROOT, ".tmp-jscpd");
const DUP_JSON = path.join(DUP_DIR, "jscpd-report.json");
const COVERAGE_JSON = path.join(API_ROOT, "coverage/coverage-final.json");

function toDomainBucket(relPath) {
  const parts = relPath.split("/");
  if (parts.length === 1) {
    return parts[0];
  }
  return `${parts[0]}/${parts[1]}`;
}

function parseCoverageSummary() {
  if (!fs.existsSync(COVERAGE_JSON)) {
    return null;
  }

  const report = JSON.parse(fs.readFileSync(COVERAGE_JSON, "utf8"));
  const totals = {
    statements: { total: 0, hit: 0 },
    functions: { total: 0, hit: 0 },
    branches: { total: 0, hit: 0 },
  };

  for (const file of Object.values(report)) {
    for (const hit of Object.values(file.s ?? {})) {
      totals.statements.total += 1;
      if (hit > 0) totals.statements.hit += 1;
    }

    for (const hit of Object.values(file.f ?? {})) {
      totals.functions.total += 1;
      if (hit > 0) totals.functions.hit += 1;
    }

    for (const branchArr of Object.values(file.b ?? {})) {
      for (const hit of branchArr) {
        totals.branches.total += 1;
        if (hit > 0) totals.branches.hit += 1;
      }
    }
  }

  const toPct = (hit, total) => (total === 0 ? 0 : Number(((hit / total) * 100).toFixed(2)));

  return {
    statementsPct: toPct(totals.statements.hit, totals.statements.total),
    functionsPct: toPct(totals.functions.hit, totals.functions.total),
    branchesPct: toPct(totals.branches.hit, totals.branches.total),
    totals,
  };
}

function runDuplicationReport() {
  ensureDir(DUP_DIR);
  try {
    execSync(
      "node scripts/quality/run-jscpd.mjs . -p '**/*.ts' -i '**/*.test.ts,**/dist/**,**/coverage/**,**/node_modules/**' --gitignore --min-lines 10 --min-tokens 70 -r json -o .tmp-jscpd",
      { cwd: API_ROOT, stdio: "ignore" },
    );
  } catch {
    return null;
  }

  if (!fs.existsSync(DUP_JSON)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DUP_JSON, "utf8"));
    return parsed.statistics?.total ?? null;
  } catch {
    return null;
  } finally {
    fs.rmSync(DUP_DIR, { recursive: true, force: true });
  }
}

function topEntries(mapLike, limit = 15) {
  return sortByCountDesc(mapLike.entries())
    .slice(0, limit)
    .map(([file, count]) => ({ file, count }));
}

function countAllFiles(dirPath) {
  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      total += countAllFiles(absPath);
      continue;
    }
    total += 1;
  }

  return total;
}

function buildBaseline() {
  const allTs = walkTsFiles(API_ROOT);
  const testTs = allTs.filter((file) => isTestFile(file.relPath));
  const prodTs = allTs.filter((file) => !isTestFile(file.relPath));

  const topLoc = prodTs
    .map((file) => ({ file: file.relPath, lines: countLines(file.absPath) }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 20);

  const domainMap = new Map();
  for (const file of prodTs) {
    const domain = toDomainBucket(file.relPath);
    const current = domainMap.get(domain) ?? { files: 0, lines: 0 };
    current.files += 1;
    current.lines += countLines(file.absPath);
    domainMap.set(domain, current);
  }

  const domainDistribution = [...domainMap.entries()]
    .map(([domain, data]) => ({ domain, ...data }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 20);

  const graph = buildImportGraph(API_ROOT);
  const inbound = topEntries(graph.inbound, 15);
  const outbound = topEntries(graph.outbound, 15);
  const duplication = runDuplicationReport();
  const coverage = parseCoverageSummary();

  return {
    generatedAt: new Date().toISOString(),
    scope: "apps/api",
    totals: {
      files: countAllFiles(API_ROOT),
      tsFiles: allTs.length,
      testTsFiles: testTs.length,
      prodTsFiles: prodTs.length,
    },
    topLoc,
    domainDistribution,
    coupling: {
      topInbound: inbound,
      topOutbound: outbound,
      internalEdges: graph.edges.length,
    },
    duplication,
    coverage,
  };
}

function writeMarkdown(baseline) {
  const lines = [];
  lines.push("# apps/api Baseline");
  lines.push("");
  lines.push(`Generated: ${baseline.generatedAt}`);
  lines.push("");
  lines.push("## Totals");
  lines.push(`- TS files: ${baseline.totals.tsFiles}`);
  lines.push(`- Test TS files: ${baseline.totals.testTsFiles}`);
  lines.push(`- Production TS files: ${baseline.totals.prodTsFiles}`);
  if (baseline.coverage) {
    lines.push(`- Coverage statements: ${baseline.coverage.statementsPct}%`);
  }
  if (baseline.duplication) {
    lines.push(`- Duplicate lines: ${baseline.duplication.duplicatedLines} (${baseline.duplication.percentage}%)`);
  }

  lines.push("");
  lines.push("## Largest Files");
  for (const row of baseline.topLoc.slice(0, 10)) {
    lines.push(`- ${row.file}: ${row.lines}`);
  }

  lines.push("");
  lines.push("## Domain Concentration");
  for (const row of baseline.domainDistribution.slice(0, 10)) {
    lines.push(`- ${row.domain}: ${row.files} files, ${row.lines} lines`);
  }

  lines.push("");
  lines.push("## Coupling");
  lines.push("Top inbound:");
  for (const row of baseline.coupling.topInbound.slice(0, 10)) {
    lines.push(`- ${row.file}: ${row.count}`);
  }
  lines.push("Top outbound:");
  for (const row of baseline.coupling.topOutbound.slice(0, 10)) {
    lines.push(`- ${row.file}: ${row.count}`);
  }

  fs.writeFileSync(OUT_MD, `${lines.join("\n")}\n`, "utf8");
}

ensureDir(OUT_DIR);
const baseline = buildBaseline();
fs.writeFileSync(OUT_JSON, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
writeMarkdown(baseline);

console.log(`Baseline written to ${path.relative(REPO_ROOT, OUT_JSON)}`);
console.log(`Summary written to ${path.relative(REPO_ROOT, OUT_MD)}`);

import { buildImportGraph } from "./_imports.mjs";
import { hasInternalPathSegment, inferLayerTag } from "./_architecture.mjs";

const API_ROOT = process.cwd();

const RULES = [
  {
    fromPrefix: "services/",
    forbiddenPrefixes: ["controllers/", "routes/"],
    reason: "Services must not depend on delivery layer",
  },
  {
    fromPrefix: "lib/",
    forbiddenPrefixes: ["controllers/", "routes/", "middleware/"],
    reason: "Lib must remain independent from delivery layer",
  },
  {
    fromPrefix: "middleware/",
    forbiddenPrefixes: ["controllers/", "routes/"],
    reason: "Middleware must not import controllers/routes",
  },
  {
    fromPrefix: "schemas/",
    forbiddenPrefixes: ["controllers/", "routes/", "middleware/"],
    reason: "Schemas should be transport/domain contracts only",
  },
  {
    fromPrefix: "routes/",
    forbiddenPrefixes: ["services/"],
    reason: "Routes should delegate to controllers, not services",
  },
];

function matchesPrefix(filePath, prefix) {
  return filePath === prefix.slice(0, -1) || filePath.startsWith(prefix);
}

const graph = buildImportGraph(API_ROOT);
const violations = [];
const untaggedFiles = [];
const ALLOWLIST = new Set([
  "routes/apiKey.routes.ts -> services/apiKey/apiKey.useCase.ts",
  "routes/chat.routes.ts -> services/chat/imageUpload.useCase.ts",
  "routes/chat.routes.ts -> services/runs/messageOrchestrator.service.ts",
  "routes/chat.routes.ts -> services/chat/promptEnhance.useCase.ts",
  "routes/chat.routes.ts -> services/previewRouting/subdomainUpdate.service.ts",
  "routes/github.routes.ts -> services/github/github.useCase.ts",
]);

for (const file of graph.files) {
  if (!inferLayerTag(file.relPath)) {
    untaggedFiles.push(file.relPath);
  }
}

for (const edge of graph.edges) {
  const key = `${edge.from} -> ${edge.to}`;
  if (ALLOWLIST.has(key)) {
    continue;
  }

  if (hasInternalPathSegment(edge.to)) {
    violations.push({
      from: edge.from,
      to: edge.to,
      reason: "Deep imports into /internal/ modules are forbidden",
    });
    continue;
  }

  for (const rule of RULES) {
    if (!matchesPrefix(edge.from, rule.fromPrefix)) {
      continue;
    }

    const blocked = rule.forbiddenPrefixes.find((prefix) =>
      matchesPrefix(edge.to, prefix),
    );

    if (blocked) {
      violations.push({
        from: edge.from,
        to: edge.to,
        reason: rule.reason,
      });
      break;
    }
  }
}

if (untaggedFiles.length > 0 || violations.length > 0) {
  if (untaggedFiles.length > 0) {
    console.error("Architecture tag violations found (untagged files):");
    for (const file of untaggedFiles) {
      console.error(`- ${file}`);
    }
    console.error(`Total untagged files: ${untaggedFiles.length}`);
  }

  console.error("Boundary violations found:");
  for (const item of violations) {
    console.error(`- ${item.from} -> ${item.to} (${item.reason})`);
  }
  console.error(`Total violations: ${violations.length}`);
  process.exit(1);
}

console.log(
  `Boundary check passed (${graph.edges.length} internal edges, ${graph.files.length} tagged files).`,
);

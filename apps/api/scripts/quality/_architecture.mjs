const INFRA_SERVICE_PREFIXES = [
  "services/sandbox/",
  "services/storage/",
  "services/websearch/",
  "services/github/",
  "services/previewRouting/",
  "services/network/",
  "services/queue/",
  "services/registry/",
];

const DELIVERY_FILE_SET = new Set([
  "server.http.ts",
  "queue.worker.ts",
  "queue.worker.events.ts",
  "queue.worker.helpers.ts",
  "queue.worker.shutdown.ts",
]);

export function inferLayerTag(relPath) {
  if (relPath.startsWith("tests/")) {
    return "test";
  }

  if (
    DELIVERY_FILE_SET.has(relPath) ||
    relPath.startsWith("controllers/") ||
    relPath.startsWith("routes/") ||
    relPath.startsWith("middleware/") ||
    relPath.startsWith("server/")
  ) {
    return "delivery";
  }

  if (
    relPath.startsWith("schemas/") ||
    relPath === "services/planning/schemas.ts"
  ) {
    return "domain";
  }

  if (
    relPath === "app.config.ts" ||
    relPath === "vitest.config.ts" ||
    relPath.startsWith("scripts/") ||
    relPath.startsWith("lib/") ||
    relPath.startsWith("utils/")
  ) {
    return "shared";
  }

  if (INFRA_SERVICE_PREFIXES.some((prefix) => relPath.startsWith(prefix))) {
    return "infra";
  }

  if (relPath.startsWith("services/")) {
    return "application";
  }

  return null;
}

export function hasInternalPathSegment(relPath) {
  return relPath.includes("/internal/");
}

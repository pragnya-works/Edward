import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findCachedJscpdBinary() {
  const npxRoot = path.join(os.homedir(), ".npm", "_npx");
  if (!fs.existsSync(npxRoot)) {
    return null;
  }

  const candidates = [];
  for (const entry of fs.readdirSync(npxRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const binPath = path.join(
      npxRoot,
      entry.name,
      "node_modules",
      ".bin",
      "jscpd",
    );
    try {
      fs.accessSync(binPath, fs.constants.X_OK);
      const stats = fs.statSync(binPath);
      candidates.push({ binPath, mtimeMs: stats.mtimeMs });
    } catch {
      continue;
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.binPath ?? null;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
  });
  return typeof result.status === "number" ? result.status : 1;
}

const args = process.argv.slice(2);
const localBin = path.join(process.cwd(), "node_modules", ".bin", "jscpd");
const cachedBin = findCachedJscpdBinary();

let exitCode = 0;
if (isExecutable(localBin)) {
  exitCode = run(localBin, args);
} else if (cachedBin) {
  exitCode = run(cachedBin, args);
} else {
  exitCode = run("npx", ["-y", "jscpd", ...args]);
}

if (exitCode !== 0) {
  process.exit(exitCode);
}

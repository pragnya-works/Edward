import path from "path";
import { redis } from "../../../lib/redis.js";
import { logger } from "../../../utils/logger.js";
import { getSandboxState } from "../state.service.js";
import { CONTAINER_WORKDIR, execCommand, getContainer } from "../docker.service.js";
import { scheduleSandboxFlush } from "./scheduler.js";
import {
  acquireLock,
  BUFFER_FILES_SET_PREFIX,
  BUFFER_KEY_PREFIX,
  cleanupBufferKeys,
  FLUSH_LOCK_PREFIX,
  FLUSH_LOCK_TTL,
  isProtectedFile,
  MAX_WRITE_BUFFER,
} from "./shared.js";
import { SANDBOX_TTL } from "../lifecycle/state.js";

export async function writeSandboxFile(
  sandboxId: string,
  filePath: string,
  content: string,
): Promise<void> {
  const sandbox = await getSandboxState(sandboxId);
  if (!sandbox) return;

  const normalizedPath = path.posix.normalize(filePath);
  if (normalizedPath.startsWith("..") || path.posix.isAbsolute(normalizedPath)) {
    throw new Error(`Invalid path: ${filePath}`);
  }

  if (isProtectedFile(normalizedPath, sandbox.scaffoldedFramework)) {
    logger.info(
      {
        sandboxId,
        filePath: normalizedPath,
        framework: sandbox.scaffoldedFramework,
      },
      "Blocked write to protected framework file",
    );
    return;
  }

  const bufferKey = `${BUFFER_KEY_PREFIX}${sandboxId}:${normalizedPath}`;
  const filesSetKey = `${BUFFER_FILES_SET_PREFIX}${sandboxId}`;

  try {
    const pipeline = redis.pipeline();
    pipeline.append(bufferKey, content);
    pipeline.sadd(filesSetKey, normalizedPath);
    pipeline.pexpire(bufferKey, SANDBOX_TTL);
    pipeline.pexpire(filesSetKey, SANDBOX_TTL);

    const results = await pipeline.exec();
    if (!results) {
      throw new Error("Redis pipeline returned null results");
    }

    const errors: Error[] = [];
    for (const result of results) {
      if (result && result[0]) {
        const err = result[0];
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }

    if (errors.length > 0) {
      throw new Error(`Redis pipeline errors: ${errors.map((e) => e.message).join("; ")}`);
    }
  } catch (error) {
    logger.error({ error, sandboxId, filePath: normalizedPath }, "Redis write failed");
    throw new Error(
      `Failed to buffer file content: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const currentBufferSize = await redis.strlen(bufferKey);
  if (currentBufferSize > MAX_WRITE_BUFFER) {
    scheduleSandboxFlush(sandboxId, true);
    return;
  }

  scheduleSandboxFlush(sandboxId, false);
}

export async function prepareSandboxFile(
  sandboxId: string,
  filePath: string,
): Promise<void> {
  const sandbox = await getSandboxState(sandboxId);
  if (!sandbox) {
    throw new Error(`Sandbox not found: ${sandboxId}`);
  }

  const normalizedPath = path.posix.normalize(filePath);
  if (normalizedPath.startsWith("..") || path.posix.isAbsolute(normalizedPath)) {
    throw new Error(`Invalid path: ${filePath}`);
  }

  if (isProtectedFile(normalizedPath, sandbox.scaffoldedFramework)) {
    logger.info(
      {
        sandboxId,
        filePath: normalizedPath,
        framework: sandbox.scaffoldedFramework,
      },
      "Blocked prepare/truncate for protected framework file",
    );
    return;
  }

  const lockKey = `${FLUSH_LOCK_PREFIX}${sandboxId}`;
  const acquired = await acquireLock(lockKey, FLUSH_LOCK_TTL, true);
  if (!acquired) {
    throw new Error(`Failed to acquire lock to prepare file: ${filePath}`);
  }

  try {
    await cleanupBufferKeys(sandboxId, [normalizedPath]);

    const fullPath = path.posix.join(CONTAINER_WORKDIR, normalizedPath);
    const dirPath = path.posix.dirname(fullPath);

    const container = getContainer(sandbox.containerId);
    await execCommand(container, ["mkdir", "-p", dirPath]);
    await execCommand(container, ["truncate", "-s", "0", fullPath]);
  } finally {
    await redis.del(lockKey);
  }
}

export async function sanitizeSandboxFile(
  sandboxId: string,
  filePath: string,
): Promise<void> {
  const sandbox = await getSandboxState(sandboxId);
  if (!sandbox) return;

  const normalizedPath = path.posix.normalize(filePath);
  if (normalizedPath.startsWith("..") || path.posix.isAbsolute(normalizedPath)) {
    throw new Error(`Invalid path: ${filePath}`);
  }

  if (isProtectedFile(normalizedPath, sandbox.scaffoldedFramework)) {
    logger.info(
      {
        sandboxId,
        filePath: normalizedPath,
        framework: sandbox.scaffoldedFramework,
      },
      "Blocked sanitize for protected framework file",
    );
    return;
  }

  const fullPath = path.posix.join(CONTAINER_WORKDIR, normalizedPath);
  const container = getContainer(sandbox.containerId);

  const script = `
const fs = require('fs');
const filePath = process.argv[1];
if (!fs.existsSync(filePath)) process.exit(0);

let content = fs.readFileSync(filePath, 'utf8');
let changed = true;

while (changed) {
  changed = false;
  const trimmed = content.trim();

  if (trimmed.startsWith('<![CDATA[') && trimmed.endsWith(']]>')) {
    content = trimmed.slice(9, -3).trim();
    changed = true;
    continue;
  }

  if (trimmed.startsWith('\`\`\`') && trimmed.endsWith('\`\`\`')) {
    const lines = trimmed.split('\\n');
    if (lines.length >= 2 && lines[lines.length - 1].trim() === '\`\`\`') {
      content = lines.slice(1, -1).join('\\n').trim();
      changed = true;
      continue;
    }
  }
}

content = content
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'");

fs.writeFileSync(filePath, content);
`;

  await execCommand(container, ["node", "-e", script, fullPath]);
}

export async function clearBuffers(sandboxId: string): Promise<void> {
  const filesSetKey = `${BUFFER_FILES_SET_PREFIX}${sandboxId}`;
  const filePaths = await redis.smembers(filesSetKey);
  await cleanupBufferKeys(sandboxId, filePaths);
  await redis.del(filesSetKey);
}

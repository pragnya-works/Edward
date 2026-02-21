import { CONTAINER_WORKDIR, isContainerAlive } from "./docker.sandbox.js";
import { createLogger } from "../../utils/logger.js";
import { getSandboxState } from "./state.sandbox.js";
import { executeSandboxCommand } from "./command.sandbox.js";
import {
  MAX_FILES,
  MAX_TOTAL_BYTES,
  PRIORITY_FILES,
  SANDBOX_EXCLUDED_DIRS,
  TEXT_EXTENSIONS,
} from "./fileSelection.constants.js";
import { hasTextExtension } from "./fileSelection.utils.js";
import {
  readFileFromS3 as readFileFromS3Storage,
  readProjectFilesFromS3 as readProjectFilesFromS3Storage,
} from "./read/s3.readers.js";

const logger = createLogger("READ_SANDBOX");

export async function isSandboxAlive(sandboxId: string): Promise<boolean> {
  const sandbox = await getSandboxState(sandboxId);
  if (!sandbox) return false;
  return isContainerAlive(sandbox.containerId);
}

async function readSandboxFile(
  sandboxId: string,
  filePath: string,
): Promise<string> {
  const sandbox = await getSandboxState(sandboxId);
  if (!sandbox) return "";

  try {
    const result = await executeSandboxCommand(
      sandboxId,
      { command: "cat", args: [filePath] },
      { timeout: 5000 },
    );
    if (result.exitCode === 0) return result.stdout ?? "";

    if (await isContainerAlive(sandbox.containerId)) {
      logger.warn(
        { sandboxId, filePath, exitCode: result.exitCode },
        "Cat command failed on alive container, skipping S3 fallback",
      );
      return "";
    }
  } catch (err) {
    if (await isSandboxAlive(sandboxId)) {
      logger.warn(
        { sandboxId, filePath, err },
        "Failed to read file from live container, skipping S3 fallback",
      );
      return "";
    }
    logger.debug(
      { sandboxId, filePath, err },
      "Failed to read sandbox file from container, trying S3 fallback",
    );
  }

  try {
    const relPath = filePath.startsWith(CONTAINER_WORKDIR + "/")
      ? filePath.slice(CONTAINER_WORKDIR.length + 1)
      : filePath;

    return await readFileFromS3Storage(sandbox.userId, sandbox.chatId, relPath);
  } catch (err) {
    logger.warn({ sandboxId, filePath, err }, "S3 fallback read failed");
    return "";
  }
}

export async function readFileFromS3(
  userId: string,
  chatId: string,
  relPath: string,
): Promise<string> {
  return readFileFromS3Storage(userId, chatId, relPath);
}

export async function readProjectFilesFromS3(
  userId: string,
  chatId: string,
): Promise<Map<string, string>> {
  return readProjectFilesFromS3Storage(userId, chatId);
}

export async function readAllProjectFiles(
  sandboxId: string,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  const excludeArgs = SANDBOX_EXCLUDED_DIRS.flatMap((d) => [
    "-path",
    `*/${d}/*`,
    "-prune",
    "-o",
  ]);
  const findArgs = [CONTAINER_WORKDIR, ...excludeArgs, "-type", "f", "-print"];

  let listOutput = "";
  let useS3Fallback = false;

  const sandbox = await getSandboxState(sandboxId);
  if (!sandbox) return files;

  try {
    const result = await executeSandboxCommand(
      sandboxId,
      { command: "find", args: findArgs },
      { timeout: 10000 },
    );
    listOutput = result.stdout ?? "";
    if (!listOutput && result.exitCode !== 0) {
      if (await isContainerAlive(sandbox.containerId)) {
        logger.warn(
          { sandboxId },
          "Find command failed on live container, not falling back to S3",
        );
        return files;
      }
      useS3Fallback = true;
    }
  } catch (err) {
    if (await isContainerAlive(sandbox.containerId)) {
      logger.error(
        { sandboxId, err },
        "Failed to execute find on live container",
      );
      return files;
    }
    logger.warn(
      { sandboxId },
      "Failed to list project files via container, trying S3 fallback",
    );
    useS3Fallback = true;
  }

  if (useS3Fallback) {
    return readProjectFilesFromS3Storage(sandbox.userId, sandbox.chatId);
  }

  if (!listOutput) return files;

  const allPaths = listOutput
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => !!p && hasTextExtension(p, TEXT_EXTENSIONS));

  const toRelPath = (fullPath: string) =>
    fullPath.startsWith(CONTAINER_WORKDIR + "/")
      ? fullPath.slice(CONTAINER_WORKDIR.length + 1)
      : fullPath;

  const relToFull = new Map<string, string>();
  for (const fullPath of allPaths) {
    relToFull.set(toRelPath(fullPath), fullPath);
  }

  const selected: string[] = [];
  for (const rel of PRIORITY_FILES) {
    const fullPath = relToFull.get(rel);
    if (fullPath) selected.push(fullPath);
    if (selected.length >= MAX_FILES) break;
  }

  if (selected.length < MAX_FILES) {
    const remaining = allPaths
      .filter((path) => !selected.includes(path))
      .sort((a, b) => toRelPath(a).localeCompare(toRelPath(b)));
    selected.push(...remaining.slice(0, MAX_FILES - selected.length));
  }

  let totalBytes = 0;
  for (const fullPath of selected) {
    if (totalBytes >= MAX_TOTAL_BYTES) break;

    const content = await readSandboxFile(sandboxId, fullPath);
    if (!content) continue;

    const contentBytes = Buffer.byteLength(content, "utf8");
    if (totalBytes + contentBytes > MAX_TOTAL_BYTES) continue;

    const relPath = toRelPath(fullPath);
    files.set(relPath, content);
    totalBytes += contentBytes;
  }

  return files;
}

export async function readSpecificFiles(
  sandboxId: string,
  filePaths: string[],
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  let totalBytes = 0;

  for (const filePath of filePaths) {
    if (totalBytes >= MAX_TOTAL_BYTES) break;

    const content = await readSandboxFile(sandboxId, filePath);
    if (!content) continue;

    const contentBytes = Buffer.byteLength(content, "utf8");
    if (totalBytes + contentBytes > MAX_TOTAL_BYTES) continue;

    files.set(filePath, content);
    totalBytes += contentBytes;
  }

  return files;
}

export function formatProjectSnapshot(files: Map<string, string>): string {
  if (files.size === 0) return "";
  const sections: string[] = ["CURRENT PROJECT STATE:"];
  for (const [filePath, content] of files) {
    sections.push(`--- FILE: ${filePath} ---\n${content}`);
  }
  return sections.join("\n");
}

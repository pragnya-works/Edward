import {
  getContainer,
  CONTAINER_WORKDIR,
  isContainerAlive,
} from "./docker.sandbox.js";
import { downloadFile, uploadFile } from "../storage.service.js";
import { buildS3Key } from "../storage/key.utils.js";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "../storage/config.js";
import tar from "tar-stream";
import zlib from "zlib";
import { Readable } from "stream";
import { createLogger } from "../../utils/logger.js";
import { getSandboxState } from "./state.sandbox.js";
import { executeSandboxCommand } from "./command.sandbox.js";

const logger = createLogger("READ_SANDBOX");

const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 500;

const EXCLUDED_DIRS = [
  "node_modules",
  ".next",
  "dist",
  "build",
  "out",
  ".git",
  ".cache",
  "coverage",
  ".turbo",
  ".vercel",
];
const EXCLUDED_DIR_SET = new Set(EXCLUDED_DIRS);

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".css",
  ".scss",
  ".html",
  ".md",
  ".yml",
  ".yaml",
  ".toml",
  ".env",
  ".mjs",
  ".cjs",
  ".svg",
  ".txt",
]);

function isExcludedRelPath(relPath: string): boolean {
  return relPath
    .split("/")
    .some((segment) => segment.length > 0 && EXCLUDED_DIR_SET.has(segment));
}

const PRIORITY_FILES = [
  // Framework entrypoints
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/globals.css",
  "src/main.tsx",
  "src/App.tsx",
  "src/index.css",

  // Common UI/theme files
  "src/components/ui.tsx",
  "src/components/providers.tsx",
  "src/components/theme-toggle.tsx",
  "src/components/themeToggle.tsx",
  "src/lib/utils.ts",
  "components.json",

  // Tooling/config that affects UI builds
  "next.config.mjs",
  "vite.config.ts",
  "tailwind.config.ts",
  "tailwind.config.js",
  "postcss.config.mjs",
  "postcss.config.js",
  "tsconfig.json",
  "package.json",

  // Vanilla entrypoints
  "index.html",
  "styles.css",
  "script.js",
];

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

    // If command failed but sandbox is alive, don't fallback to potentially stale S3
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

    return await readFileFromS3(sandbox.userId, sandbox.chatId, relPath);
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
  try {
    const s3Key = buildS3Key(userId, chatId, `sources/${relPath}`);
    const stream = await downloadFile(s3Key);
    if (!stream) return "";

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch (err) {
    logger.warn({ userId, chatId, relPath, err }, "S3 read failed");
    return "";
  }
}

export async function readProjectFilesFromS3(
  userId: string,
  chatId: string,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  try {
    if (!BUCKET_NAME) return files;

    const s3Prefix = buildS3Key(userId, chatId, "sources/");
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: s3Prefix,
    });

    const response = await s3Client.send(listCommand);
    const objects = response.Contents || [];

    if (objects.length === 0) {
      // Try hydration if we found nothing in sources/ but might have a backup
      logger.info(
        { userId, chatId },
        "Sources empty, checking for backup to hydrate S3",
      );
      const hydrated = await hydrateS3FromBackup(userId, chatId);
      if (!hydrated) return files;

      // Re-list after hydration
      const retryResponse = await s3Client.send(listCommand);
      const retryObjects = retryResponse.Contents || [];
      if (retryObjects.length === 0) return files;
      objects.push(...retryObjects);
    }

    const paths = objects
      .map((obj) => obj.Key)
      .filter((key): key is string => !!key)
      .map((key) => key.slice(s3Prefix.length));

    const allRelPaths = paths.filter((p) => {
      if (!p) return false;
      if (isExcludedRelPath(p)) return false;
      const dotIdx = p.lastIndexOf(".");
      return dotIdx !== -1 && TEXT_EXTENSIONS.has(p.slice(dotIdx));
    });

    // Priority selection logic (reused from container logic)
    const selected: string[] = [];
    for (const rel of PRIORITY_FILES) {
      if (allRelPaths.includes(rel)) selected.push(rel);
      if (selected.length >= MAX_FILES) break;
    }

    if (selected.length < MAX_FILES) {
      const remaining = allRelPaths
        .filter((p) => !selected.includes(p))
        .sort((a, b) => a.localeCompare(b));
      selected.push(...remaining.slice(0, MAX_FILES - selected.length));
    }

    let totalBytes = 0;
    for (const relPath of selected) {
      if (totalBytes >= MAX_TOTAL_BYTES) break;

      const content = await readFileFromS3(userId, chatId, relPath);
      if (!content) continue;

      const contentBytes = Buffer.byteLength(content, "utf8");
      if (totalBytes + contentBytes > MAX_TOTAL_BYTES) continue;

      files.set(relPath, content);
      totalBytes += contentBytes;
    }
  } catch (err) {
    logger.error({ userId, chatId, err }, "S3 project file retrieval failed");
  }
  return files;
}

export async function readAllProjectFiles(
  sandboxId: string,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  const excludeArgs = EXCLUDED_DIRS.flatMap((d) => [
    "-path",
    `*/${d}/*`,
    "-prune",
    "-o",
  ]);
  const findArgs = [CONTAINER_WORKDIR, ...excludeArgs, "-type", "f", "-print"];

  let listOutput: string = "";
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
    return readProjectFilesFromS3(sandbox.userId, sandbox.chatId);
  }

  if (!listOutput) return files;

  const allPaths = listOutput
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false;
      const dotIdx = p.lastIndexOf(".");
      return dotIdx !== -1 && TEXT_EXTENSIONS.has(p.slice(dotIdx));
    });

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
    const full = relToFull.get(rel);
    if (full) selected.push(full);
    if (selected.length >= MAX_FILES) break;
  }

  if (selected.length < MAX_FILES) {
    const remaining = allPaths
      .filter((p) => !selected.includes(p))
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

export async function hydrateS3FromBackup(
  userId: string,
  chatId: string,
): Promise<boolean> {
  try {
    const backupKey = buildS3Key(userId, chatId, "source_backup.tar.gz");
    const stream = await downloadFile(backupKey);
    if (!stream) return false;

    logger.info({ chatId, userId }, "Hydrating S3 sources from backup tarball");
    const gunzip = zlib.createGunzip();
    const extract = tar.extract();

    const uploadPromises: Promise<void>[] = [];

    await new Promise<void>((resolve, reject) => {
      extract.on("entry", (header, fileStream, next) => {
        const relPath = header.name.replace(/^[^/]+\//, "");
        if (!relPath || header.type !== "file") {
          fileStream.resume();
          return next();
        }

        const chunks: Buffer[] = [];
        fileStream.on("data", (c) => chunks.push(c));
        fileStream.on("end", async () => {
          const content = Buffer.concat(chunks);
          const s3Key = buildS3Key(userId, chatId, `sources/${relPath}`);
          uploadPromises.push(
            uploadFile(
              s3Key,
              content,
              {
                sandboxId: "hydrated",
                originalPath: relPath,
                uploadTimestamp: new Date().toISOString(),
              },
              content.length,
              "no-cache",
            )
              .then(() => {})
              .catch((uploadErr) => {
                logger.warn(
                  { chatId, relPath, err: uploadErr },
                  "Failed to upload hydrated file",
                );
              }),
          );
          next();
        });
        fileStream.on("error", (fileErr) => {
          logger.warn(
            { chatId, relPath, err: fileErr },
            "File stream error during hydration",
          );
          next(fileErr);
        });
      });

      const readableStream = stream as Readable;
      readableStream.on("error", (err) => {
        logger.error({ chatId, err }, "Source stream error during hydration");
        reject(err);
      });
      gunzip.on("error", (err) => {
        logger.error({ chatId, err }, "Gunzip error during hydration");
        reject(err);
      });
      extract.on("finish", resolve);
      extract.on("error", (err) => {
        logger.error({ chatId, err }, "Tar extraction error during hydration");
        reject(err);
      });

      readableStream.pipe(gunzip).pipe(extract);
    });

    await Promise.all(uploadPromises);
    logger.info(
      { chatId, fileCount: uploadPromises.length },
      "S3 hydration complete",
    );
    return true;
  } catch (err) {
    logger.error({ chatId, err }, "S3 hydration failed");
    return false;
  }
}

export async function mirrorSandboxToS3(sandboxId: string): Promise<void> {
  try {
    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) return;

    logger.info(
      { sandboxId },
      "Mirroring complete sandbox state to S3 via archive",
    );
    const container = getContainer(sandbox.containerId);
    const archiveStream = await container.getArchive({
      path: CONTAINER_WORKDIR,
    });

    const extract = tar.extract();
    const uploadPromises: Promise<void>[] = [];

    await new Promise<void>((resolve, reject) => {
      extract.on("entry", (header, fileStream, next) => {
        const relPath = header.name.replace(/^[^/]+\//, "");
        if (!relPath || header.type !== "file") {
          fileStream.resume();
          return next();
        }
        if (isExcludedRelPath(relPath)) {
          fileStream.resume();
          return next();
        }

        const dotIdx = relPath.lastIndexOf(".");
        const ext = dotIdx !== -1 ? relPath.slice(dotIdx) : "";
        if (!TEXT_EXTENSIONS.has(ext)) {
          fileStream.resume();
          return next();
        }

        const chunks: Buffer[] = [];
        fileStream.on("data", (c) => chunks.push(c));
        fileStream.on("end", async () => {
          const content = Buffer.concat(chunks);
          if (content.length > 512 * 1024) {
            return next();
          }

          const s3Key = buildS3Key(
            sandbox.userId,
            sandbox.chatId,
            `sources/${relPath}`,
          );
          uploadPromises.push(
            uploadFile(
              s3Key,
              content,
              {
                sandboxId,
                originalPath: relPath,
                uploadTimestamp: new Date().toISOString(),
              },
              content.length,
              "no-cache",
            )
              .then(() => {})
              .catch((uploadErr) => {
                logger.warn(
                  { sandboxId, relPath, err: uploadErr },
                  "Failed to upload mirrored file",
                );
              }),
          );
          next();
        });
        fileStream.on("error", (fileErr) => {
          logger.warn(
            { sandboxId, relPath, err: fileErr },
            "File stream error during mirroring",
          );
          next(fileErr);
        });
      });

      archiveStream.on("error", (err) => {
        logger.error(
          { sandboxId, err },
          "Archive stream error during mirroring",
        );
        reject(err);
      });
      extract.on("finish", resolve);
      extract.on("error", (err) => {
        logger.error(
          { sandboxId, err },
          "Tar extraction error during mirroring",
        );
        reject(err);
      });

      archiveStream.pipe(extract);
    });

    await Promise.all(uploadPromises);
    logger.info(
      { sandboxId, fileCount: uploadPromises.length },
      "Archive-based S3 mirroring complete",
    );
  } catch (err) {
    logger.error({ sandboxId, err }, "Archive-based S3 mirroring failed");
  }
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

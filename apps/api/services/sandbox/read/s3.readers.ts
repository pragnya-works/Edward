import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import tar from "tar-stream";
import zlib from "zlib";
import { Readable } from "stream";
import { createLogger } from "../../../utils/logger.js";
import { downloadFile } from "../../storage.service.js";
import { buildS3Key } from "../../storage/key.utils.js";
import { BUCKET_NAME, s3Client } from "../../storage/config.js";
import {
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_NON_PRIORITY_BYTES,
  MAX_NON_PRIORITY_FILES,
  MAX_SNAPSHOT_CACHE_ENTRIES,
  MAX_TOTAL_BYTES,
  PRIORITY_FILES,
  PRIORITY_FILE_SET,
  SANDBOX_EXCLUDED_DIRS,
  TEXT_EXTENSIONS,
} from "../fileSelection.constants.js";
import {
  hasTextExtension,
  isExcludedRelPath,
  normalizeArchiveRelPath,
  readBufferStream,
  readUtf8Stream,
} from "../fileSelection.utils.js";

const logger = createLogger("READ_SANDBOX");
const SNAPSHOT_CACHE_TTL_MS = 30_000;
const EXCLUDED_DIR_SET = new Set(SANDBOX_EXCLUDED_DIRS);

interface SourceSnapshotPayload {
  version: number;
  generatedAt: string;
  fileCount: number;
  files: Record<string, string>;
}

const snapshotCache = new Map<
  string,
  { expiresAt: number; files: Map<string, string> }
>();

function getSnapshotCacheEntry(
  cacheKey: string,
): { expiresAt: number; files: Map<string, string> } | null {
  const cached = snapshotCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    snapshotCache.delete(cacheKey);
    return null;
  }
  return cached;
}

function setSnapshotCacheEntry(
  cacheKey: string,
  files: Map<string, string>,
): void {
  const now = Date.now();
  for (const [key, value] of snapshotCache) {
    if (value.expiresAt <= now) {
      snapshotCache.delete(key);
    }
  }

  if (
    !snapshotCache.has(cacheKey) &&
    snapshotCache.size >= MAX_SNAPSHOT_CACHE_ENTRIES
  ) {
    const oldestKey = snapshotCache.keys().next().value;
    if (oldestKey) {
      snapshotCache.delete(oldestKey);
    }
  }

  snapshotCache.set(cacheKey, {
    expiresAt: now + SNAPSHOT_CACHE_TTL_MS,
    files: new Map(files),
  });
}

function cacheKeyForSnapshot(userId: string, chatId: string): string {
  return `${userId}:${chatId}`;
}

async function readProjectFilesFromSnapshot(
  userId: string,
  chatId: string,
): Promise<Map<string, string>> {
  const cacheKey = cacheKeyForSnapshot(userId, chatId);
  const cached = getSnapshotCacheEntry(cacheKey);
  if (cached) {
    return new Map(cached.files);
  }

  const snapshotKey = buildS3Key(userId, chatId, "source_snapshot.json.gz");
  const stream = await downloadFile(snapshotKey);
  if (!stream) {
    setSnapshotCacheEntry(cacheKey, new Map<string, string>());
    return new Map<string, string>();
  }

  try {
    const gzBuffer = await readBufferStream(stream);
    if (gzBuffer.length === 0) return new Map<string, string>();

    const jsonBuffer = zlib.gunzipSync(gzBuffer);
    const parsed = JSON.parse(jsonBuffer.toString("utf8")) as
      | SourceSnapshotPayload
      | Record<string, unknown>;

    const rawFiles =
      typeof parsed === "object" &&
      parsed !== null &&
      "files" in parsed &&
      typeof parsed.files === "object" &&
      parsed.files !== null
        ? (parsed.files as Record<string, unknown>)
        : undefined;

    if (!rawFiles) return new Map<string, string>();

    const selected: string[] = [];
    const validPaths = Object.keys(rawFiles).filter((relPath) => {
      if (!relPath) return false;
      if (isExcludedRelPath(relPath, EXCLUDED_DIR_SET)) return false;
      return hasTextExtension(relPath, TEXT_EXTENSIONS);
    });

    for (const rel of PRIORITY_FILES) {
      if (validPaths.includes(rel)) selected.push(rel);
      if (selected.length >= MAX_FILES) break;
    }

    if (selected.length < MAX_FILES) {
      const remaining = validPaths
        .filter((p) => !PRIORITY_FILE_SET.has(p))
        .sort((a, b) => a.localeCompare(b));
      selected.push(...remaining.slice(0, MAX_FILES - selected.length));
    }

    const files = new Map<string, string>();
    let totalBytes = 0;
    for (const relPath of selected) {
      const value = rawFiles[relPath];
      if (typeof value !== "string" || value.length === 0) continue;

      const contentBytes = Buffer.byteLength(value, "utf8");
      if (totalBytes + contentBytes > MAX_TOTAL_BYTES) continue;

      files.set(relPath, value);
      totalBytes += contentBytes;
      if (totalBytes >= MAX_TOTAL_BYTES) break;
    }

    setSnapshotCacheEntry(cacheKey, files);
    return new Map(files);
  } catch (err) {
    logger.warn({ userId, chatId, err }, "Failed to parse source snapshot");
    setSnapshotCacheEntry(cacheKey, new Map<string, string>());
    return new Map<string, string>();
  }
}

async function readFileFromBackupArchive(
  userId: string,
  chatId: string,
  relPath: string,
): Promise<string> {
  const normalizedTarget = relPath.replace(/^\/+/, "");
  if (!normalizedTarget) return "";

  const backupKey = buildS3Key(userId, chatId, "source_backup.tar.gz");
  const stream = await downloadFile(backupKey);
  if (!stream) return "";

  const gunzip = zlib.createGunzip();
  const extract = tar.extract();
  let fileContent = "";

  await new Promise<void>((resolve, reject) => {
    extract.on("entry", (header, fileStream, next) => {
      if (header.type !== "file") {
        fileStream.resume();
        next();
        return;
      }

      const archiveRelPath = normalizeArchiveRelPath(header.name);
      if (!archiveRelPath || archiveRelPath !== normalizedTarget) {
        fileStream.resume();
        next();
        return;
      }

      const chunks: Buffer[] = [];
      fileStream.on("data", (chunk) => chunks.push(chunk));
      fileStream.on("end", () => {
        fileContent = Buffer.concat(chunks).toString("utf8");
        next();
      });
      fileStream.on("error", reject);
    });

    const readableStream = stream as Readable;
    readableStream.on("error", reject);
    gunzip.on("error", reject);
    extract.on("finish", resolve);
    extract.on("error", reject);

    readableStream.pipe(gunzip).pipe(extract);
  });

  return fileContent;
}

async function readProjectFilesFromBackupArchive(
  userId: string,
  chatId: string,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const backupKey = buildS3Key(userId, chatId, "source_backup.tar.gz");
  const stream = await downloadFile(backupKey);
  if (!stream) return files;

  const priorityCandidates = new Map<string, string>();
  const regularCandidates = new Map<string, string>();
  let regularCandidateBytes = 0;
  const gunzip = zlib.createGunzip();
  const extract = tar.extract();

  await new Promise<void>((resolve, reject) => {
    extract.on("entry", (header, fileStream, next) => {
      if (header.type !== "file") {
        fileStream.resume();
        next();
        return;
      }

      const relPath = normalizeArchiveRelPath(header.name);
      if (!relPath || isExcludedRelPath(relPath, EXCLUDED_DIR_SET)) {
        fileStream.resume();
        next();
        return;
      }

      if (!hasTextExtension(relPath, TEXT_EXTENSIONS)) {
        fileStream.resume();
        next();
        return;
      }

      const chunks: Buffer[] = [];
      fileStream.on("data", (chunk) => chunks.push(chunk));
      fileStream.on("end", () => {
        const content = Buffer.concat(chunks);
        if (content.length > MAX_FILE_BYTES) {
          next();
          return;
        }

        const textContent = content.toString("utf8");
        if (PRIORITY_FILE_SET.has(relPath)) {
          priorityCandidates.set(relPath, textContent);
          next();
          return;
        }

        if (regularCandidates.size >= MAX_NON_PRIORITY_FILES) {
          next();
          return;
        }

        const contentBytes = Buffer.byteLength(textContent, "utf8");
        if (regularCandidateBytes + contentBytes > MAX_NON_PRIORITY_BYTES) {
          next();
          return;
        }

        regularCandidates.set(relPath, textContent);
        regularCandidateBytes += contentBytes;
        next();
      });
      fileStream.on("error", reject);
    });

    const readableStream = stream as Readable;
    readableStream.on("error", reject);
    gunzip.on("error", reject);
    extract.on("finish", resolve);
    extract.on("error", reject);

    readableStream.pipe(gunzip).pipe(extract);
  });

  const selected: string[] = [];
  for (const rel of PRIORITY_FILES) {
    if (priorityCandidates.has(rel)) selected.push(rel);
    if (selected.length >= MAX_FILES) break;
  }

  if (selected.length < MAX_FILES) {
    const remaining = Array.from(regularCandidates.keys())
      .filter((p) => !PRIORITY_FILE_SET.has(p))
      .sort((a, b) => a.localeCompare(b));
    selected.push(...remaining.slice(0, MAX_FILES - selected.length));
  }

  let totalBytes = 0;
  for (const relPath of selected) {
    if (totalBytes >= MAX_TOTAL_BYTES) break;
    const content =
      priorityCandidates.get(relPath) ?? regularCandidates.get(relPath);
    if (!content) continue;

    const contentBytes = Buffer.byteLength(content, "utf8");
    if (totalBytes + contentBytes > MAX_TOTAL_BYTES) continue;

    files.set(relPath, content);
    totalBytes += contentBytes;
  }

  return files;
}

async function readProjectFilesFromLegacySources(
  userId: string,
  chatId: string,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  if (!BUCKET_NAME) return files;

  const s3Prefix = buildS3Key(userId, chatId, "sources/");
  const listCommand = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: s3Prefix,
  });

  const response = await s3Client.send(listCommand);
  const objects = response.Contents || [];
  if (objects.length === 0) return files;

  const paths = objects
    .map((obj) => obj.Key)
    .filter((key): key is string => !!key)
    .map((key) => key.slice(s3Prefix.length));

  const allRelPaths = paths.filter((p) => {
    if (!p) return false;
    if (isExcludedRelPath(p, EXCLUDED_DIR_SET)) return false;
    return hasTextExtension(p, TEXT_EXTENSIONS);
  });

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
    const s3Key = buildS3Key(userId, chatId, `sources/${relPath}`);
    const stream = await downloadFile(s3Key);
    if (!stream) continue;

    const content = await readUtf8Stream(stream);
    if (!content) continue;

    const contentBytes = Buffer.byteLength(content, "utf8");
    if (totalBytes + contentBytes > MAX_TOTAL_BYTES) continue;

    files.set(relPath, content);
    totalBytes += contentBytes;
  }

  return files;
}

export async function readFileFromS3(
  userId: string,
  chatId: string,
  relPath: string,
): Promise<string> {
  try {
    const cacheKey = cacheKeyForSnapshot(userId, chatId);
    const cachedSnapshot = getSnapshotCacheEntry(cacheKey);
    if (cachedSnapshot) {
      const fromCache = cachedSnapshot.files.get(relPath);
      if (typeof fromCache === "string") {
        return fromCache;
      }
    }

    const snapshotFiles = await readProjectFilesFromSnapshot(userId, chatId);
    const fromSnapshot = snapshotFiles.get(relPath);
    if (fromSnapshot) {
      return fromSnapshot;
    }

    const s3Key = buildS3Key(userId, chatId, `sources/${relPath}`);
    const stream = await downloadFile(s3Key);
    if (stream) {
      return await readUtf8Stream(stream);
    }

    const fromBackup = await readProjectFilesFromBackupArchive(userId, chatId);
    if (fromBackup.size > 0) {
      setSnapshotCacheEntry(cacheKey, fromBackup);
      return fromBackup.get(relPath) ?? "";
    }

    return await readFileFromBackupArchive(userId, chatId, relPath);
  } catch (err) {
    logger.warn({ userId, chatId, relPath, err }, "S3 read failed");
    return "";
  }
}

export async function readProjectFilesFromS3(
  userId: string,
  chatId: string,
): Promise<Map<string, string>> {
  try {
    if (!BUCKET_NAME) return new Map<string, string>();

    const fromSnapshot = await readProjectFilesFromSnapshot(userId, chatId);
    if (fromSnapshot.size > 0) {
      return fromSnapshot;
    }

    const fromBackup = await readProjectFilesFromBackupArchive(userId, chatId);
    if (fromBackup.size > 0) {
      setSnapshotCacheEntry(cacheKeyForSnapshot(userId, chatId), fromBackup);
      return fromBackup;
    }

    logger.info(
      { userId, chatId },
      "Backup archive unavailable, falling back to legacy sources/ objects",
    );
    return await readProjectFilesFromLegacySources(userId, chatId);
  } catch (err) {
    logger.error({ userId, chatId, err }, "S3 project file retrieval failed");
    return new Map<string, string>();
  }
}

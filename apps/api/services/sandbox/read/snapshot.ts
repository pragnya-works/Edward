import zlib from "zlib";
import { promisify } from "node:util";
import { createLogger } from "../../../utils/logger.js";
import { downloadFile } from "../../storage.service.js";
import { buildS3Key } from "../../storage/key.utils.js";
import {
  MAX_FILES,
  MAX_TOTAL_BYTES,
  PRIORITY_FILES,
  PRIORITY_FILE_SET,
  SANDBOX_EXCLUDED_DIRS,
  TEXT_EXTENSIONS,
} from "../fileSelection.constants.js";
import {
  hasTextExtension,
  isExcludedRelPath,
  readBufferStream,
} from "../fileSelection.utils.js";
import { cacheKeyForSnapshot, getSnapshotCacheEntry, setSnapshotCacheEntry } from "./cache.js";

const logger = createLogger("READ_SANDBOX");
const gunzipAsync = promisify(zlib.gunzip);
const EXCLUDED_DIR_SET = new Set(SANDBOX_EXCLUDED_DIRS);

interface SourceSnapshotPayload {
  version: number;
  generatedAt: string;
  fileCount: number;
  files: Record<string, string>;
}

export async function readProjectFilesFromSnapshot(
  userId: string,
  chatId: string,
): Promise<Map<string, string>> {
  const cacheKey = cacheKeyForSnapshot(userId, chatId);
  const cached = await getSnapshotCacheEntry(cacheKey);
  if (cached) {
    return new Map(cached.files);
  }

  const snapshotKey = buildS3Key(userId, chatId, "source_snapshot.json.gz");
  const stream = await downloadFile(snapshotKey);
  if (!stream) {
    await setSnapshotCacheEntry(cacheKey, new Map<string, string>());
    return new Map<string, string>();
  }

  try {
    const gzBuffer = await readBufferStream(stream);
    if (gzBuffer.length === 0) return new Map<string, string>();

    const jsonBuffer = await gunzipAsync(gzBuffer);
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

    await setSnapshotCacheEntry(cacheKey, files);
    return new Map(files);
  } catch (err) {
    logger.warn({ userId, chatId, err }, "Failed to parse source snapshot");
    await setSnapshotCacheEntry(cacheKey, new Map<string, string>());
    return new Map<string, string>();
  }
}

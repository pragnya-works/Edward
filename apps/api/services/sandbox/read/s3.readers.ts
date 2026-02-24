import { createLogger } from "../../../utils/logger.js";
import { downloadFile } from "../../storage.service.js";
import { buildS3Key } from "../../storage/key.utils.js";
import { BUCKET_NAME } from "../../storage/storage.config.js";
import { readUtf8Stream } from "../fileSelection.utils.js";
import {
  cacheKeyForSnapshot,
  getSnapshotCacheEntry,
  setSnapshotCacheEntry,
} from "./cache.js";
import { readProjectFilesFromSnapshot } from "./snapshotReader.js";
import {
  readFileFromBackupArchive,
  readProjectFilesFromBackupArchive,
} from "./backupReader.js";
import { readProjectFilesFromLegacySources } from "./legacyReader.js";

const logger = createLogger("READ_SANDBOX");

export async function readFileFromS3(
  userId: string,
  chatId: string,
  relPath: string,
): Promise<string> {
  try {
    const cacheKey = cacheKeyForSnapshot(userId, chatId);
    const cachedSnapshot = await getSnapshotCacheEntry(cacheKey);
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
      await setSnapshotCacheEntry(cacheKey, fromBackup);
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
      await setSnapshotCacheEntry(cacheKeyForSnapshot(userId, chatId), fromBackup);
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

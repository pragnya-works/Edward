import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { downloadFile } from "../../storage.service.js";
import { buildS3Key } from "../../storage/key.utils.js";
import { BUCKET_NAME, s3Client } from "../../storage/storage.config.js";
import {
  MAX_FILES,
  MAX_TOTAL_BYTES,
  PRIORITY_FILES,
  SANDBOX_EXCLUDED_DIRS,
  TEXT_EXTENSIONS,
} from "../fileSelection.constants.js";
import {
  hasTextExtension,
  isExcludedRelPath,
  readUtf8Stream,
} from "../fileSelection.utils.js";

const EXCLUDED_DIR_SET = new Set(SANDBOX_EXCLUDED_DIRS);

export async function readProjectFilesFromLegacySources(
  userId: string,
  chatId: string,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  if (!BUCKET_NAME) return files;

  const s3Prefix = buildS3Key(userId, chatId, "sources/");
  const paths: string[] = [];
  let continuationToken: string | undefined;

  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: s3Prefix,
      ContinuationToken: continuationToken,
    });

    const response = await s3Client.send(listCommand);
    const objects = response.Contents ?? [];
    for (const object of objects) {
      if (!object.Key) continue;
      paths.push(object.Key.slice(s3Prefix.length));
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  if (paths.length === 0) return files;

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

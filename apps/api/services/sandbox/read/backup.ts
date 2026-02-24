import tar from "tar-stream";
import zlib from "zlib";
import { Readable } from "stream";
import { downloadFile } from "../../storage.service.js";
import { buildS3Key } from "../../storage/key.utils.js";
import {
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_NON_PRIORITY_BYTES,
  MAX_NON_PRIORITY_FILES,
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
} from "../fileSelection.utils.js";

const EXCLUDED_DIR_SET = new Set(SANDBOX_EXCLUDED_DIRS);

export async function readFileFromBackupArchive(
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

export async function readProjectFilesFromBackupArchive(
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

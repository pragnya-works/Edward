import {
  readFileFromBackupArchive as readFileFromBackupArchiveInternal,
  readProjectFilesFromBackupArchive as readProjectFilesFromBackupArchiveInternal,
} from "./backup.js";

export async function readFileFromBackupArchive(
  userId: string,
  chatId: string,
  relPath: string,
): Promise<string> {
  return readFileFromBackupArchiveInternal(userId, chatId, relPath);
}

export async function readProjectFilesFromBackupArchive(
  userId: string,
  chatId: string,
): Promise<Map<string, string>> {
  return readProjectFilesFromBackupArchiveInternal(userId, chatId);
}

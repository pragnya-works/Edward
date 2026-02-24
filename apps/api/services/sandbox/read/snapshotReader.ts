import { readProjectFilesFromSnapshot as readProjectFilesFromSnapshotInternal } from "./snapshot.js";

export async function readProjectFilesFromSnapshot(
  userId: string,
  chatId: string,
): Promise<Map<string, string>> {
  return readProjectFilesFromSnapshotInternal(userId, chatId);
}

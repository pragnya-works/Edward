import { readProjectFilesFromLegacySources as readProjectFilesFromLegacySourcesInternal } from "./legacy.js";

export async function readProjectFilesFromLegacySources(
  userId: string,
  chatId: string,
): Promise<Map<string, string>> {
  return readProjectFilesFromLegacySourcesInternal(userId, chatId);
}

import {
  cacheKeyForSnapshot as cacheKeyForSnapshotInternal,
  getSnapshotCacheEntry as getSnapshotCacheEntryInternal,
  setSnapshotCacheEntry as setSnapshotCacheEntryInternal,
} from "./cache.js";

export function cacheKeyForSnapshot(userId: string, chatId: string): string {
  return cacheKeyForSnapshotInternal(userId, chatId);
}

export async function getSnapshotCacheEntry(cacheKey: string): Promise<{ expiresAt: number; files: Map<string, string> } | null> {
  return getSnapshotCacheEntryInternal(cacheKey);
}

export async function setSnapshotCacheEntry(
  cacheKey: string,
  files: Map<string, string>,
): Promise<void> {
  return setSnapshotCacheEntryInternal(cacheKey, files);
}

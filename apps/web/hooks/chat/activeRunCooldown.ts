const NO_RUN_LOOKUP_COOLDOWN_MS = 10_000;
const MAX_NO_RUN_COOLDOWN_ENTRIES = 250;
const NO_RUN_LOOKUP_COOLDOWN_STORAGE_PREFIX = "edward:no-run-cooldown:";
const noRunLookupCooldownByKey = new Map<string, number>();

function readPersistedNoRunLookupCooldown(
  lookupKey: string,
): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      `${NO_RUN_LOOKUP_COOLDOWN_STORAGE_PREFIX}${lookupKey}`,
    );
    if (!rawValue) {
      return null;
    }

    const expiresAt = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
      window.sessionStorage.removeItem(
        `${NO_RUN_LOOKUP_COOLDOWN_STORAGE_PREFIX}${lookupKey}`,
      );
      return null;
    }

    return expiresAt;
  } catch {
    return null;
  }
}

function persistNoRunLookupCooldown(lookupKey: string, expiresAt: number): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${NO_RUN_LOOKUP_COOLDOWN_STORAGE_PREFIX}${lookupKey}`,
      String(expiresAt),
    );
  } catch {
    // sessionStorage may be unavailable in private browsing.
  }
}

function clearPersistedNoRunLookupCooldown(lookupKey: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(
      `${NO_RUN_LOOKUP_COOLDOWN_STORAGE_PREFIX}${lookupKey}`,
    );
  } catch {
    // no-op
  }
}

function trimNoRunLookupCooldownMap(now: number): void {
  if (noRunLookupCooldownByKey.size === 0) {
    return;
  }

  for (const [lookupKey, expiresAt] of noRunLookupCooldownByKey) {
    if (expiresAt <= now) {
      noRunLookupCooldownByKey.delete(lookupKey);
    }
  }

  while (noRunLookupCooldownByKey.size > MAX_NO_RUN_COOLDOWN_ENTRIES) {
    const oldestLookupKey = noRunLookupCooldownByKey.keys().next().value;
    if (!oldestLookupKey) {
      break;
    }
    noRunLookupCooldownByKey.delete(oldestLookupKey);
    clearPersistedNoRunLookupCooldown(oldestLookupKey);
  }
}

export function buildNoRunLookupCooldownKey(
  chatId: string,
  latestUserMessageId: string | null,
): string {
  return `${chatId}:${latestUserMessageId ?? "_"}`;
}

export function isNoRunLookupOnCooldown(lookupKey: string): boolean {
  trimNoRunLookupCooldownMap(Date.now());

  const mapExpiresAt = noRunLookupCooldownByKey.get(lookupKey);
  if (typeof mapExpiresAt === "number") {
    if (mapExpiresAt <= Date.now()) {
      noRunLookupCooldownByKey.delete(lookupKey);
      clearPersistedNoRunLookupCooldown(lookupKey);
      return false;
    }
    return true;
  }

  const persistedExpiresAt = readPersistedNoRunLookupCooldown(lookupKey);
  if (typeof persistedExpiresAt !== "number") {
    return false;
  }

  noRunLookupCooldownByKey.set(lookupKey, persistedExpiresAt);

  if (persistedExpiresAt <= Date.now()) {
    noRunLookupCooldownByKey.delete(lookupKey);
    clearPersistedNoRunLookupCooldown(lookupKey);
    return false;
  }

  return true;
}

export function markNoRunLookupCooldown(lookupKey: string): void {
  const now = Date.now();
  trimNoRunLookupCooldownMap(now);
  const expiresAt = now + NO_RUN_LOOKUP_COOLDOWN_MS;
  noRunLookupCooldownByKey.set(lookupKey, expiresAt);
  persistNoRunLookupCooldown(lookupKey, expiresAt);
}

export function clearNoRunLookupCooldown(lookupKey: string): void {
  noRunLookupCooldownByKey.delete(lookupKey);
  clearPersistedNoRunLookupCooldown(lookupKey);
}

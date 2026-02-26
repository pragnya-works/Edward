const NO_RUN_LOOKUP_COOLDOWN_MS = 10_000;
const MAX_NO_RUN_COOLDOWN_ENTRIES = 250;
const noRunLookupCooldownByKey = new Map<string, number>();

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
      return false;
    }
    return true;
  }
  return false;
}

export function markNoRunLookupCooldown(lookupKey: string): void {
  const now = Date.now();
  trimNoRunLookupCooldownMap(now);
  const expiresAt = now + NO_RUN_LOOKUP_COOLDOWN_MS;
  noRunLookupCooldownByKey.set(lookupKey, expiresAt);
}

export function clearNoRunLookupCooldown(lookupKey: string): void {
  noRunLookupCooldownByKey.delete(lookupKey);
}

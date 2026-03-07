import { cooldownByScope, emitChange, quotaByScope, stateRuntime } from "./state.shared";

function normalizeOwner(owner: string | null): string | null {
  if (!owner) {
    return null;
  }

  const normalized = owner.trim();
  return normalized.length > 0 ? normalized : null;
}

export function syncRateLimitStateOwner(owner: string | null): void {
  const nextOwner = normalizeOwner(owner);
  if (stateRuntime.owner === nextOwner) {
    return;
  }

  stateRuntime.owner = nextOwner;
  cooldownByScope.clear();
  quotaByScope.clear();
  emitChange();
}

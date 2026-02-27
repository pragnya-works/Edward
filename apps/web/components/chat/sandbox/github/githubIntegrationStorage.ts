import { STORAGE_KEY_PREFIX } from "@/lib/githubIntegration/githubIntegrationNaming";

export interface PersistedGithubIntegrationState {
  connectedRepo?: string;
  repoInput?: string;
  branchInput?: string;
  commitMessage?: string;
}

export interface GithubIntegrationStateSnapshot {
  repoInput: string;
  branchInput: string;
  commitMessage: string;
  connectedRepo: string | null;
}

const runtimeStorage = new Map<string, PersistedGithubIntegrationState>();
const MAX_RUNTIME_STORAGE_ENTRIES = 100;
let hasPrunedLegacyLocalStorage = false;

function pruneLegacyGithubLocalStorageKeys(): void {
  if (typeof window === "undefined" || hasPrunedLegacyLocalStorage) {
    return;
  }

  hasPrunedLegacyLocalStorage = true;
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(STORAGE_KEY_PREFIX)) {
        continue;
      }
      keysToRemove.push(key);
    }

    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access issues and keep the integration flow usable.
  }
}

function normalizePayload(
  state: GithubIntegrationStateSnapshot,
): PersistedGithubIntegrationState {
  return {
    connectedRepo: state.connectedRepo ?? undefined,
    repoInput: state.repoInput.trim() || undefined,
    branchInput: state.branchInput.trim() || undefined,
    commitMessage: state.commitMessage.trim() || undefined,
  };
}

function setRuntimeStorageItem(
  storageKey: string,
  payload: PersistedGithubIntegrationState,
): void {
  if (runtimeStorage.has(storageKey)) {
    runtimeStorage.delete(storageKey);
  }

  runtimeStorage.set(storageKey, payload);
  if (runtimeStorage.size <= MAX_RUNTIME_STORAGE_ENTRIES) {
    return;
  }

  const oldestStorageKey = runtimeStorage.keys().next().value;
  if (oldestStorageKey) {
    runtimeStorage.delete(oldestStorageKey);
  }
}

export function resolvePersistedGithubIntegrationState(
  storageKey: string,
  fallback: GithubIntegrationStateSnapshot,
): GithubIntegrationStateSnapshot {
  if (typeof window === "undefined") {
    return fallback;
  }

  pruneLegacyGithubLocalStorageKeys();

  try {
    const parsed = runtimeStorage.get(storageKey);
    if (!parsed) {
      return fallback;
    }

    return {
      repoInput: parsed.repoInput?.trim() || fallback.repoInput,
      branchInput: parsed.branchInput?.trim() || fallback.branchInput,
      commitMessage: parsed.commitMessage?.trim() || fallback.commitMessage,
      connectedRepo: parsed.connectedRepo?.trim() || fallback.connectedRepo,
    };
  } catch {
    return fallback;
  }
}

export function persistGithubIntegrationState(
  storageKey: string,
  state: GithubIntegrationStateSnapshot,
): void {
  if (typeof window === "undefined") {
    return;
  }

  pruneLegacyGithubLocalStorageKeys();

  try {
    setRuntimeStorageItem(storageKey, normalizePayload(state));
  } catch {
    // Keep UI usable even if persistence fails.
  }
}

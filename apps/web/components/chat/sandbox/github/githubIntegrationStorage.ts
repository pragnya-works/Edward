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

export function resolvePersistedGithubIntegrationState(
  storageKey: string,
  fallback: GithubIntegrationStateSnapshot,
): GithubIntegrationStateSnapshot {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const rawStored = window.localStorage.getItem(storageKey);
    if (!rawStored) {
      return fallback;
    }

    const parsed = JSON.parse(rawStored) as PersistedGithubIntegrationState;
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

  const payload: PersistedGithubIntegrationState = {
    connectedRepo: state.connectedRepo ?? undefined,
    repoInput: state.repoInput.trim() || undefined,
    branchInput: state.branchInput.trim() || undefined,
    commitMessage: state.commitMessage.trim() || undefined,
  };

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Keep UI usable even if persistence fails.
  }
}

import { createGithubClient } from "@edward/octokit";

export const GITHUB_PROVIDER_ID = "github";
export const DEFAULT_GITHUB_BASE_BRANCH = "main";
export const REPO_MISSING_RECONNECT_MESSAGE =
  "Previously connected GitHub repository no longer exists or access was removed. Please connect again.";

export interface RepoSnapshot {
  isPrivate: boolean;
  canPush: boolean;
  defaultBranch: string;
}

function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") {
      return status;
    }
  }
  return undefined;
}

export function parseRepoFullName(fullName: string): { owner: string; repo: string } {
  const parts = fullName.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid repository name format. Use owner/repo");
  }
  return { owner: parts[0], repo: parts[1] };
}

export async function getRepoSnapshot(
  octokit: ReturnType<typeof createGithubClient>,
  owner: string,
  repo: string,
): Promise<RepoSnapshot | null> {
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    return {
      isPrivate: data.private === true,
      canPush: data.permissions?.push === true,
      defaultBranch:
        data.default_branch?.trim() || DEFAULT_GITHUB_BASE_BRANCH,
    };
  } catch (error) {
    if (getErrorStatus(error) === 404) {
      return null;
    }
    throw error;
  }
}

export function isAlreadyExistsError(error: Error): boolean {
  const lower = error.message.toLowerCase();
  return lower.includes("already exists") || lower.includes("reference already exists");
}

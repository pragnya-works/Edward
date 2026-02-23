import type { GithubDisconnectReason } from "@edward/shared/constants";

export interface GithubRepoStatusData {
  connected: boolean;
  repoFullName: string | null;
  repoExists: boolean;
  canPush: boolean;
  disconnectedReason: GithubDisconnectReason;
  defaultBranch: string | null;
}

export interface ConnectGithubPayload {
  chatId: string;
  repoFullName?: string;
  repoName?: string;
}

export interface ConnectGithubData {
  success: boolean;
  repoFullName: string;
  created: boolean;
  isPrivate: boolean;
  defaultBranch: string;
  privacyDefaultApplied: boolean;
  privacyEnforced?: boolean;
}

export interface CreateGithubBranchPayload {
  chatId: string;
  branchName: string;
  baseBranch?: string;
}

export interface CreateGithubBranchData {
  success: boolean;
  existed: boolean;
  branchName: string;
  baseBranch: string;
}

export interface SyncGithubPayload {
  chatId: string;
  branch: string;
  commitMessage: string;
}

export interface SyncGithubData {
  sha: string;
  fileCount: number;
  noChanges: boolean;
}

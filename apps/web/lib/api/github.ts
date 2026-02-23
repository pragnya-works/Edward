import type {
  ConnectGithubResponse,
  CreateGithubBranchResponse,
  GithubRepoStatusResponse,
  SyncGithubResponse,
} from "@edward/shared/api/contracts";
import type {
  ConnectGithubPayload,
  CreateGithubBranchPayload,
  SyncGithubPayload,
} from "@edward/shared/github/types";
import { fetchApi } from "@/lib/api/httpClient";

export async function getGithubRepoStatus(
  chatId: string,
): Promise<GithubRepoStatusResponse> {
  const params = new URLSearchParams({ chatId });
  return fetchApi<GithubRepoStatusResponse>(`/github/status?${params.toString()}`, {
    method: "GET",
  });
}

export async function connectGithubRepo(
  payload: ConnectGithubPayload,
): Promise<ConnectGithubResponse> {
  return fetchApi<ConnectGithubResponse>("/github/connect", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createGithubBranch(
  payload: CreateGithubBranchPayload,
): Promise<CreateGithubBranchResponse> {
  return fetchApi<CreateGithubBranchResponse>("/github/branch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function syncGithubRepo(
  payload: SyncGithubPayload,
): Promise<SyncGithubResponse> {
  return fetchApi<SyncGithubResponse>("/github/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

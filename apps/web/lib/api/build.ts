import {
  type BuildStatusResponse,
  type RebuildResponse,
  type SandboxFilesResponse,
} from "@edward/shared/api/contracts";
import { fetchApi } from "@/lib/api/httpClient";

export async function getBuildStatus(
  chatId: string,
): Promise<BuildStatusResponse> {
  return fetchApi<BuildStatusResponse>(`/chat/${chatId}/build-status`);
}

export async function getSandboxFiles(
  chatId: string,
): Promise<SandboxFilesResponse> {
  return fetchApi<SandboxFilesResponse>(`/chat/${chatId}/sandbox-files`);
}

export async function triggerRebuild(
  chatId: string,
): Promise<RebuildResponse> {
  return fetchApi<RebuildResponse>(`/chat/${chatId}/rebuild`, {
    method: "POST",
  });
}

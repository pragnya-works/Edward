import {
  type BuildStatusResponse,
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

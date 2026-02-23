import {
  BuildRecordStatus as SharedBuildRecordStatus,
  type BuildError as SharedBuildError,
  type BuildErrorReport as SharedBuildErrorReport,
  type BuildStatusResponse as SharedBuildStatusResponse,
  type SandboxFilesResponse as SharedSandboxFilesResponse,
} from "@edward/shared/api/contracts";
import { fetchApi } from "@/lib/api/httpClient";

export type BuildError = SharedBuildError;
export type BuildErrorReport = SharedBuildErrorReport;
export type BuildRecordStatus = SharedBuildRecordStatus;
export type BuildStatusResponse = SharedBuildStatusResponse;
export type SandboxFilesResponse = SharedSandboxFilesResponse;

export const BuildRecordStatus = SharedBuildRecordStatus;

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

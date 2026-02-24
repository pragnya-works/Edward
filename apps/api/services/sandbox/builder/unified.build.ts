import {
  buildAndUploadUnified as buildAndUploadUnifiedInternal,
} from "./unified.build/orchestrator.js";

export interface BuildResult {
  success: boolean;
  buildDirectory: string | null;
  error?: string;
  previewUploaded: boolean;
  previewUrl: string | null;
}

export async function buildAndUploadUnified(
  sandboxId: string,
): Promise<BuildResult> {
  return buildAndUploadUnifiedInternal(sandboxId);
}

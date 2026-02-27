import {
  type GithubFile,
} from "@edward/octokit";
import { ensureError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";
import { createBackupArchive } from "../sandbox/backup/archive.js";
import { getContainer } from "../sandbox/docker.service.js";
import { getActiveSandbox } from "../sandbox/lifecycle/provisioning.js";
import { getSandboxState } from "../sandbox/state.service.js";
import { extractFilesFromStream } from "./sync.utils.js";

export async function loadFilesForGithubSync(
  chatId: string,
  userId: string,
): Promise<GithubFile[]> {
  const files: GithubFile[] = [];
  const sandboxId = await getActiveSandbox(chatId);

  if (sandboxId) {
    const sandbox = await getSandboxState(sandboxId);
    if (!sandbox) {
      throw new Error("Sandbox state not found");
    }

    const container = getContainer(sandbox.containerId);
    try {
      const { uploadStream, completion } = await createBackupArchive(container);
      const [extractedFiles] = await Promise.all([
        extractFilesFromStream(uploadStream),
        completion,
      ]);
      files.push(...extractedFiles);
    } catch (err) {
      logger.error(ensureError(err), "Sandbox file extraction failed");
      throw new Error("Failed to extract files from the project sandbox");
    }

    return files;
  }

  logger.info(
    { chatId, userId },
    "No active sandbox, attempting sync from S3 backup",
  );

  const { isS3Configured } = await import("../storage/storage.config.js");
  const { buildS3Key } = await import("../storage/key.utils.js");
  const { downloadFile } = await import("../storage.service.js");

  if (!isS3Configured()) {
    throw new Error(
      "GitHub sync failed: No active sandbox and S3 storage is not configured",
    );
  }

  const s3Key = buildS3Key(userId, chatId, "source_backup.tar.gz");
  const backupStream = await downloadFile(s3Key);

  if (!backupStream) {
    throw new Error(
      "GitHub sync failed: No active sandbox or previous backup found to sync",
    );
  }

  try {
    const extractedFiles = await extractFilesFromStream(backupStream);
    files.push(...extractedFiles);
    return files;
  } catch (err) {
    logger.error(ensureError(err), "S3 backup extraction failed");
    throw new Error("Failed to extract files from the S3 backup for GitHub sync");
  }
}

import { logger } from "../../../utils/logger.js";
import type { ChatRequestContext } from "./requestContext.js";
import { getActiveSandbox } from "../../sandbox/lifecycle/provisioning.js";
import { readAllProjectFiles } from "../../sandbox/read.service.js";
import { readProjectFilesFromS3 } from "../../sandbox/read/s3.readers.js";

export interface SandboxFileSnapshot {
  path: string;
  content: string;
  isComplete: true;
}

export async function getSandboxFilesUseCase(
  context: ChatRequestContext,
): Promise<{
  sandboxId: string | null;
  files: SandboxFileSnapshot[];
}> {
  const sandboxId = (await getActiveSandbox(context.chatId)) ?? null;
  const filesMap = sandboxId
    ? await readAllProjectFiles(sandboxId)
    : await readProjectFilesFromS3WithLog(context);

  const files = Array.from(filesMap.entries()).map(([path, content]) => ({
    path,
    content,
    isComplete: true as const,
  }));

  return {
    sandboxId,
    files,
  };
}

async function readProjectFilesFromS3WithLog(
  context: ChatRequestContext,
): Promise<Map<string, string>> {
  logger.info(
    { chatId: context.chatId, userId: context.userId },
    "No active sandbox, falling back to S3 for files",
  );

  return readProjectFilesFromS3(context.userId, context.chatId);
}

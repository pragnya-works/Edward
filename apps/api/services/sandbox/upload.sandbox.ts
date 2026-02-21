import { CONTAINER_WORKDIR, getContainer } from "./docker.sandbox.js";
import { SandboxInstance } from "./types.sandbox.js";
import { uploadFile } from "../storage.service.js";
import { logger } from "../../utils/logger.js";
import { ensureError } from "../../utils/error.js";
import tar from "tar-stream";
import { generateRuntimeConfig } from "./builder/basePathInjector.js";
import {
  generateSpaFallbackHtml,
  generatePreviewRuntimeScript,
  injectRuntimeScriptIntoHtml,
  PREVIEW_RUNTIME_FILENAME,
} from "./builder/spaFallback.js";
import { Framework } from "../planning/schemas.js";
import { isS3Configured } from "../storage/config.js";
import { buildS3Key } from "../storage/key.utils.js";

export interface UploadBuildResult {
  totalFiles: number;
  successful: number;
  failed: number;
  errors: string[];
  uploadedKeys: Set<string>;
}

export async function uploadBuildFilesToS3(
  sandbox: SandboxInstance,
  buildDirectory: string,
  framework: Framework = "vanilla",
): Promise<UploadBuildResult> {
  const uploadResults: UploadBuildResult = {
    totalFiles: 0,
    successful: 0,
    failed: 0,
    errors: [],
    uploadedKeys: new Set<string>(),
  };

  if (!isS3Configured()) {
    logger.warn(
      { sandboxId: sandbox.id },
      "S3 not configured, skipping preview upload",
    );
    return uploadResults;
  }

  const container = getContainer(sandbox.containerId);
  const buildPath = `${CONTAINER_WORKDIR}/${buildDirectory}`;
  const uploadTimestamp = new Date().toISOString();

  const MAX_CONCURRENT_UPLOADS = 15;
  let activeUploads = 0;
  const pendingUploads: (() => void)[] = [];

  const acquireSlot = (): Promise<void> => {
    if (activeUploads < MAX_CONCURRENT_UPLOADS) {
      activeUploads++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      pendingUploads.push(() => {
        activeUploads++;
        resolve();
      });
    });
  };

  const releaseSlot = (): void => {
    activeUploads--;
    const next = pendingUploads.shift();
    if (next) next();
  };

  try {
    const tarArchiveStream = await container.getArchive({ path: buildPath });
    const tarExtractor = tar.extract();

    const allUploadPromises: Promise<void>[] = [];

    await new Promise<void>((resolve, reject) => {
      tarExtractor.on("entry", (header, fileStream, nextEntry) => {
        const relativePath = header.name.replace(/^[^/]+\/?/, "");
        if (!relativePath || header.type !== "file") {
          fileStream.resume();
          nextEntry();
          return;
        }

        if (
          relativePath.includes("node_modules/") ||
          relativePath.startsWith("node_modules/") ||
          relativePath.includes("/node_modules/") ||
          relativePath.startsWith(".") ||
          relativePath.includes("/.")
        ) {
          fileStream.resume();
          nextEntry();
          return;
        }

        uploadResults.totalFiles++;
        const s3Key = buildS3Key(
          sandbox.userId,
          sandbox.chatId,
          `preview/${relativePath}`,
        );
        const uploadPromise = (async () => {
          await acquireSlot();
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of fileStream) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            let fileBuffer = Buffer.concat(chunks);

            if (isHtmlFile(relativePath)) {
              const originalHtml = fileBuffer.toString("utf-8");
              const processedHtml = await processHtmlWithRuntime(
                originalHtml,
                sandbox,
                framework,
              );
              fileBuffer = Buffer.from(processedHtml);
            }

            const result = await uploadFile(
              s3Key,
              fileBuffer,
              {
                sandboxId: sandbox.id,
                originalPath: relativePath,
                uploadTimestamp,
                buildDirectory,
              },
              fileBuffer.length,
              "no-cache, no-store, must-revalidate",
            );

            if (result.success) {
              uploadResults.successful++;
              uploadResults.uploadedKeys.add(s3Key);
            } else {
              uploadResults.failed++;
              const errorMsg = result.error?.message || "Unknown error";
              uploadResults.errors.push(`${relativePath}: ${errorMsg}`);
              logger.warn(
                {
                  sandboxId: sandbox.id,
                  file: relativePath,
                  error: result.error,
                },
                "File upload failed",
              );
            }
          } catch (uploadErr) {
            uploadResults.failed++;
            const errorMsg =
              uploadErr instanceof Error
                ? uploadErr.message
                : String(uploadErr);
            uploadResults.errors.push(`${relativePath}: ${errorMsg}`);
            logger.error(
              {
                sandboxId: sandbox.id,
                file: relativePath,
                error: uploadErr,
              },
              "File upload threw exception",
            );
          } finally {
            releaseSlot();
            nextEntry();
          }
        })();

        allUploadPromises.push(uploadPromise);
      });

      tarExtractor.on("finish", () => {
        Promise.all(allUploadPromises)
          .then(() => resolve())
          .catch(reject);
      });

      tarExtractor.on("error", reject);
      tarArchiveStream.pipe(tarExtractor);
    });

    const runtimeUpload = await uploadPreviewRuntimeScript(
      sandbox,
      framework,
      buildDirectory,
      uploadTimestamp,
    );

    uploadResults.totalFiles++;
    if (runtimeUpload.success) {
      uploadResults.successful++;
      uploadResults.uploadedKeys.add(runtimeUpload.key);
    } else {
      uploadResults.failed++;
      const errorMsg = runtimeUpload.error || "Unknown error";
      uploadResults.errors.push(`${PREVIEW_RUNTIME_FILENAME}: ${errorMsg}`);
    }
  } catch (error) {
    const errorObj = ensureError(error);
    logger.error(
      { error: errorObj, sandboxId: sandbox.id, buildDirectory },
      "Failed to upload build files to S3",
    );
    uploadResults.errors.push(`Upload failed: ${errorObj.message}`);
  }

  return uploadResults;
}

async function uploadPreviewRuntimeScript(
  sandbox: SandboxInstance,
  framework: Framework,
  buildDirectory: string,
  uploadTimestamp: string,
): Promise<{ success: boolean; key: string; error?: string }> {
  const runtimeConfig = generateRuntimeConfig({
    userId: sandbox.userId,
    chatId: sandbox.chatId,
    framework,
  });

  const runtimeScript = generatePreviewRuntimeScript(runtimeConfig);
  const s3Key = buildS3Key(
    sandbox.userId,
    sandbox.chatId,
    `preview/${PREVIEW_RUNTIME_FILENAME}`,
  );

  const result = await uploadFile(
    s3Key,
    Buffer.from(runtimeScript),
    {
      sandboxId: sandbox.id,
      originalPath: PREVIEW_RUNTIME_FILENAME,
      uploadTimestamp,
      buildDirectory,
    },
    runtimeScript.length,
    "no-cache, no-store, must-revalidate",
  );

  return { success: result.success, key: s3Key, error: result.error?.message };
}

export async function uploadSpaFallback(
  sandbox: SandboxInstance,
  framework: Framework,
): Promise<{ success: boolean; error?: string }> {
  if (!isS3Configured()) {
    return { success: false, error: "S3 not configured" };
  }

  try {
    const runtimeConfig = generateRuntimeConfig({
      userId: sandbox.userId,
      chatId: sandbox.chatId,
      framework,
    });

    const fallbackHtml = injectRuntimeScriptIntoHtml(
      generateSpaFallbackHtml(runtimeConfig),
      runtimeConfig,
    );
    const s3Key = buildS3Key(
      sandbox.userId,
      sandbox.chatId,
      "preview/404.html",
    );

    const result = await uploadFile(
      s3Key,
      Buffer.from(fallbackHtml),
      {
        sandboxId: sandbox.id,
        originalPath: "404.html",
        uploadTimestamp: new Date().toISOString(),
      },
      fallbackHtml.length,
      "no-cache, no-store, must-revalidate",
    );

    return { success: result.success, error: result.error?.message };
  } catch (error) {
    const err = ensureError(error);
    logger.error(
      { error: err, sandboxId: sandbox.id },
      "Failed to upload SPA fallback",
    );
    return { success: false, error: err.message };
  }
}

export async function processIndexHtmlWithRuntime(
  indexHtml: string,
  sandbox: SandboxInstance,
  framework: Framework,
): Promise<string> {
  return processHtmlWithRuntime(indexHtml, sandbox, framework);
}

function isHtmlFile(path: string): boolean {
  return path.toLowerCase().endsWith(".html");
}

export async function processHtmlWithRuntime(
  indexHtml: string,
  sandbox: SandboxInstance,
  framework: Framework,
): Promise<string> {
  const runtimeConfig = generateRuntimeConfig({
    userId: sandbox.userId,
    chatId: sandbox.chatId,
    framework,
  });

  return injectRuntimeScriptIntoHtml(indexHtml, runtimeConfig);
}

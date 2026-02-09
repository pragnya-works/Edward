import {
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { StreamingBlobPayloadInputTypes } from "@smithy/types";
import { logger } from "../utils/logger.js";
import { s3Client, BUCKET_NAME } from "./storage/config.js";
import { getContentType, validateS3Key } from "./storage/key.utils.js";
import { uploadWithRetry } from "./storage/upload.js";

export interface CleanupResult {
  deleted: number;
  errors: string[];
}

interface UploadMetadata {
  [key: string]: string;
  sandboxId: string;
  originalPath: string;
  uploadTimestamp: string;
}

interface UploadResult {
  success: boolean;
  key: string;
  error?: Error;
}

export async function uploadFile(
  key: string,
  content: StreamingBlobPayloadInputTypes,
  metadata: UploadMetadata,
  contentLength?: number,
  cacheControl?: string,
): Promise<UploadResult> {
  if (!BUCKET_NAME) {
    logger.warn({ key }, "S3 upload skipped: bucket not configured");
    return { success: false, key, error: new Error("S3 not configured") };
  }

  try {
    validateS3Key(key);

    const contentType = getContentType(key);
    await uploadWithRetry(
      key,
      content,
      contentType,
      metadata,
      contentLength,
      cacheControl,
    );

    return { success: true, key };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(
      {
        error: err,
        key,
        errorName: err.name,
        errorMessage: err.message,
        errorStack: err.stack,
      },
      "S3 upload failed",
    );
    return { success: false, key, error: err };
  }
}

export async function downloadFile(
  key: string,
): Promise<NodeJS.ReadableStream | null> {
  if (!BUCKET_NAME) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    return (response.Body as NodeJS.ReadableStream) || null;
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") {
      logger.debug({ key }, "S3 key does not exist");
    } else {
      logger.error({ error, key }, "Failed to download file from S3");
    }
    return null;
  }
}

export async function deleteFolder(prefix: string): Promise<void> {
  if (!BUCKET_NAME) return;

  try {
    let continuationToken: string | undefined;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const listResponse = await s3Client.send(listCommand);
      const objects = listResponse.Contents || [];

      if (objects.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: {
            Objects: objects.map((obj) => ({ Key: obj.Key })),
            Quiet: true,
          },
        });

        await s3Client.send(deleteCommand);
        logger.debug({ count: objects.length, prefix }, "Deleted S3 batch");
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);
  } catch (error) {
    logger.error({ error, prefix }, "Failed to delete S3 folder");
    throw error;
  }
}

export async function cleanupS3FolderExcept(
  prefix: string,
  preserveKeys: Set<string>,
): Promise<CleanupResult> {
  const result: CleanupResult = { deleted: 0, errors: [] };

  if (!BUCKET_NAME) return result;

  try {
    let continuationToken: string | undefined;
    const keysToDelete: string[] = [];
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const listResponse = await s3Client.send(listCommand);
      const objects = listResponse.Contents || [];

      for (const obj of objects) {
        if (obj.Key && !preserveKeys.has(obj.Key)) {
          keysToDelete.push(obj.Key);
        }
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    const BATCH_SIZE = 1000;
    for (let i = 0; i < keysToDelete.length; i += BATCH_SIZE) {
      const batch = keysToDelete.slice(i, i + BATCH_SIZE);
      try {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: {
            Objects: batch.map((key) => ({ Key: key })),
            Quiet: false,
          },
        });

        const deleteResponse = await s3Client.send(deleteCommand);
        const deletedCount = deleteResponse.Deleted?.length ?? 0;
        const errors = deleteResponse.Errors ?? [];
        result.deleted += deletedCount;

        for (const err of errors) {
          const errorMsg = err.Message ?? "Unknown error";
          result.errors.push(
            `Failed to delete ${err.Key}: ${errorMsg} (Code: ${err.Code})`,
          );
          logger.error(
            { key: err.Key, code: err.Code, message: err.Message },
            "S3 delete object failed",
          );
        }
        logger.debug(
          {
            count: batch.length,
            prefix,
            batchIndex: Math.floor(i / BATCH_SIZE),
          },
          "Deleted stale S3 files batch",
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Batch ${Math.floor(i / BATCH_SIZE)}: ${errorMsg}`);
        logger.error(
          { error, prefix, batchSize: batch.length },
          "Failed to delete S3 batch",
        );
      }
    }

    if (result.deleted > 0) {
      logger.info(
        {
          deleted: result.deleted,
          preserved: preserveKeys.size,
          prefix,
        },
        "S3 cleanup completed",
      );
    }

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`List operation failed: ${errorMsg}`);
    logger.error({ error, prefix }, "Failed to list S3 folder for cleanup");
    return result;
  }
}

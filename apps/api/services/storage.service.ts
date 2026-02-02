import { ListObjectsV2Command, GetObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { StreamingBlobPayloadInputTypes } from '@smithy/types';
import { logger } from '../utils/logger.js';
import { S3File } from './sandbox/types.sandbox.js';
import { s3Client, BUCKET_NAME } from './storage/config.js';
import { getContentType, validateS3Key } from './storage/key.utils.js';
import { uploadWithRetry } from './storage/upload.js';

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
    contentLength?: number
): Promise<UploadResult> {
    if (!BUCKET_NAME) {
        logger.warn({ key }, 'S3 upload skipped: bucket not configured');
        return { success: false, key, error: new Error('S3 not configured') };
    }

    try {
        validateS3Key(key);

        const contentType = getContentType(key);
        await uploadWithRetry(key, content, contentType, metadata, contentLength);

        return { success: true, key };
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error({
            error: err,
            key,
            errorName: err.name,
            errorMessage: err.message,
            errorStack: err.stack,
        }, 'S3 upload failed');
        return { success: false, key, error: err };
    }
}

export async function listFolder(prefix: string): Promise<S3File[]> {
    if (!BUCKET_NAME) return [];

    const files: S3File[] = [];
    let continuationToken: string | undefined;

    try {
        do {
            const command = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            });

            const response = await s3Client.send(command);
            const batch = (response.Contents || [])
                .filter(item => item.Key)
                .map(item => ({
                    Key: item.Key!,
                    Size: item.Size ?? 0,
                }));

            files.push(...batch);
            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        return files;
    } catch (error) {
        logger.error({ error, prefix }, 'Failed to list S3 folder');
        return [];
    }
}

export async function downloadFile(key: string): Promise<NodeJS.ReadableStream | null> {
    if (!BUCKET_NAME) return null;

    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });

        const response = await s3Client.send(command);
        return (response.Body as NodeJS.ReadableStream) || null;
    } catch (error) {
        logger.error({ error, key }, 'Failed to download file from S3');
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
                        Objects: objects.map(obj => ({ Key: obj.Key })),
                        Quiet: true,
                    },
                });

                await s3Client.send(deleteCommand);
                logger.debug({ count: objects.length, prefix }, 'Deleted S3 batch');
            }

            continuationToken = listResponse.NextContinuationToken;
        } while (continuationToken);
    } catch (error) {
        logger.error({ error, prefix }, 'Failed to delete S3 folder');
        throw error;
    }
}
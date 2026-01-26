import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { StreamingBlobPayloadInputTypes } from '@smithy/types';
import { Readable } from 'stream';
import { lookup } from 'mime-types';
import { logger } from '../utils/logger.js';
import { S3File } from './sandbox/types.sandbox.js';

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
const REGION = process.env.AWS_REGION;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const MAX_KEY_LENGTH = 1024;

const s3Client = new S3Client({
    region: REGION,
    maxAttempts: MAX_RETRIES,
});

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

interface S3UploadError extends Error {
    key: string;
    isRetryable: boolean;
    originalError?: Error;
}

interface NetworkError extends Error {
    $metadata?: {
        httpStatusCode?: number;
    };
    statusCode?: number;
    status?: number;
}

function createS3UploadError(
    message: string,
    key: string,
    isRetryable: boolean,
    originalError?: Error
): S3UploadError {
    const error = new Error(message) as S3UploadError;
    error.name = 'S3UploadError';
    error.key = key;
    error.isRetryable = isRetryable;
    error.originalError = originalError;
    return error;
}

function validateS3Key(key: string): void {
    if (!key || key.trim().length === 0) {
        throw createS3UploadError('S3 key cannot be empty', key, false);
    }

    if (key.length > MAX_KEY_LENGTH) {
        throw createS3UploadError(
            `S3 key exceeds maximum length of ${MAX_KEY_LENGTH} characters`,
            key,
            false
        );
    }

    if (key.includes('//') || key.startsWith('/')) {
        throw createS3UploadError('S3 key contains invalid path separators', key, false);
    }

    if (key.includes('..')) {
        throw createS3UploadError('S3 key contains path traversal sequences', key, false);
    }
}

function sanitizePathComponent(component: string): string {
    return component.replace(/[^a-zA-Z0-9-_.]/g, '_');
}

function getContentType(filePath: string): string {
    if (filePath.toLowerCase().endsWith('.ts') || filePath.toLowerCase().endsWith('.tsx')) {
        return 'application/typescript';
    }

    if (filePath.toLowerCase().endsWith('.js') ||
        filePath.toLowerCase().endsWith('.jsx') ||
        filePath.toLowerCase().endsWith('.mjs') ||
        filePath.toLowerCase().endsWith('.cjs')) {
        return 'application/javascript';
    }

    const contentType = lookup(filePath) || 'application/octet-stream';
    return contentType;
}

function isRetryableError(error: Error): boolean {
    const networkError = error as NetworkError;
    const statusCode =
        networkError.$metadata?.httpStatusCode ||
        networkError.statusCode ||
        networkError.status;

    if (typeof statusCode === 'number' && statusCode >= 500 && statusCode < 600) {
        return true;
    }

    const message = error.message.toLowerCase();
    const retryablePatterns = [
        'timeout',
        'econnreset',
        'enotfound',
        'econnrefused',
        'socket hang up',
        'network',
        'throttl',
        'slowdown',
        'service unavailable',
        'bad gateway',
        'gateway timeout',
        'internal server error',
    ];

    return retryablePatterns.some(pattern => message.includes(pattern));
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
        stream.on('error', err => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

async function uploadWithRetry(
    key: string,
    body: StreamingBlobPayloadInputTypes,
    contentType: string,
    metadata: UploadMetadata,
    contentLength?: number
): Promise<void> {
    let lastError: Error | null = null;
    let uploadBody = body;
    if (uploadBody instanceof Readable) {
        try {
            uploadBody = await streamToBuffer(uploadBody);
        } catch (error) {
            throw createS3UploadError(
                `Failed to buffer upload stream: ${error instanceof Error ? error.message : String(error)}`,
                key,
                false,
                error instanceof Error ? error : new Error(String(error))
            );
        }
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            if (attempt > 0) {
                const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                logger.debug({ key, attempt: attempt + 1, delayMs: delay }, 'Retrying S3 upload');
                await sleep(delay);
            }

            const upload = new Upload({
                client: s3Client,
                params: {
                    Bucket: BUCKET_NAME!,
                    Key: key,
                    Body: uploadBody,
                    ContentType: contentType,
                    Metadata: metadata,
                    ContentLength: contentLength,
                },
                leavePartsOnError: false,
            });

            await upload.done();
            return;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (!isRetryableError(lastError)) {
                throw createS3UploadError(
                    `S3 upload failed: ${lastError.message}`,
                    key,
                    false,
                    lastError
                );
            }

            logger.warn(
                { error: lastError, key, attempt: attempt + 1 },
                'S3 upload attempt failed'
            );
        }
    }

    throw createS3UploadError(
        `S3 upload failed after ${MAX_RETRIES} attempts`,
        key,
        false,
        lastError!
    );
}

export function buildS3Key(userId: string, chatId: string, filePath?: string): string {
    const safeUserId = sanitizePathComponent(userId);
    const safeChatId = sanitizePathComponent(chatId);

    if (!safeUserId || !safeChatId) {
        throw new Error('Invalid S3 key components');
    }

    if (!filePath) {
        return `${safeUserId}/${safeChatId}/`;
    }

    const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    return `${safeUserId}/${safeChatId}/${normalizedPath}`;
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
        logger.error({ error: err, key }, 'S3 upload failed');
        return { success: false, key, error: err };
    }
}

export function isS3Configured(): boolean {
    return Boolean(BUCKET_NAME && REGION);
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

        logger.info({ prefix }, 'S3 folder deleted');
    } catch (error) {
        logger.error({ error, prefix }, 'Failed to delete S3 folder');
        throw error;
    }
}
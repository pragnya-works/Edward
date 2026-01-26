import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { StreamingBlobPayloadInputTypes } from '@smithy/types';
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

export function createS3UploadError(
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

const MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
    js: 'application/javascript',
    jsx: 'application/javascript',
    ts: 'application/typescript',
    tsx: 'application/typescript',
    mjs: 'application/javascript',
    cjs: 'application/javascript',
    html: 'text/html',
    css: 'text/css',
    json: 'application/json',
    xml: 'application/xml',
    md: 'text/markdown',
    txt: 'text/plain',
    yaml: 'text/yaml',
    yml: 'text/yaml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    pdf: 'application/pdf',
    zip: 'application/zip',
    tar: 'application/x-tar',
    gz: 'application/gzip',
});

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
    const ext = filePath.split('.').pop()?.toLowerCase();
    return (ext && MIME_TYPES[ext]) || 'application/octet-stream';
}

function isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const retryablePatterns = [
        'timeout',
        'econnreset',
        'enotfound',
        'econnrefused',
        'socket hang up',
        '5',
        'network',
        'throttl',
    ];

    return retryablePatterns.some(pattern => message.includes(pattern));
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadWithRetry(
    key: string,
    body: StreamingBlobPayloadInputTypes,
    contentType: string,
    metadata: UploadMetadata,
    contentLength?: number
): Promise<void> {
    let lastError: Error | null = null;

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
                    Body: body,
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
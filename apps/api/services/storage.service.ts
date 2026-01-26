import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { StreamingBlobPayloadInputTypes } from '@smithy/types';
import { logger } from '../utils/logger.js';

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
const REGION = process.env.AWS_REGION;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const MAX_KEY_LENGTH = 1024;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

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
    metadata: UploadMetadata
): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            if (attempt > 0) {
                const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                logger.debug({ key, attempt: attempt + 1, delayMs: delay }, 'Retrying S3 upload');
                await sleep(delay);
            }

            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME!,
                Key: key,
                Body: body,
                ContentType: contentType,
                Metadata: metadata,
            });

            await s3Client.send(command);
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

export function buildS3Key(userId: string, chatId: string, filePath: string): string {
    const safeUserId = sanitizePathComponent(userId);
    const safeChatId = sanitizePathComponent(chatId);
    const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

    if (!safeUserId || !safeChatId || !normalizedPath) {
        throw new Error('Invalid S3 key components');
    }

    return `${safeUserId}/${safeChatId}/${normalizedPath}`;
}

export async function uploadFile(
  key: string,
  content: StreamingBlobPayloadInputTypes,
  metadata: UploadMetadata
): Promise<UploadResult> {
    if (!BUCKET_NAME) {
        logger.warn({ key }, 'S3 upload skipped: bucket not configured');
        return { success: false, key, error: new Error('S3 not configured') };
    }

    try {
        validateS3Key(key);

    let size: number | undefined;

    if (typeof content === 'string' || Buffer.isBuffer(content)) {
      size = content.length;
    } else if (content instanceof Uint8Array) {
      size = content.byteLength;
    } else if (content instanceof Blob) {
      size = content.size;
    }

    if (typeof size === 'number' && size > MAX_FILE_SIZE) {
      throw createS3UploadError(
        `File size ${size} exceeds maximum ${MAX_FILE_SIZE}`,
        key,
        false
      );
    }

    const contentType = getContentType(key);
    await uploadWithRetry(key, content, contentType, metadata);

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
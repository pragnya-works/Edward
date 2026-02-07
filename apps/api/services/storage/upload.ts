import { Upload } from '@aws-sdk/lib-storage';
import { StreamingBlobPayloadInputTypes } from '@smithy/types';
import { s3Client, MAX_RETRIES, RETRY_BASE_DELAY_MS, BUCKET_NAME } from './config.js';
import { logger } from '../../utils/logger.js';

interface NetworkError extends Error {
  $metadata?: {
    httpStatusCode?: number;
  };
  statusCode?: number;
  status?: number;
}

export interface S3UploadError extends Error {
  key: string;
  isRetryable: boolean;
  originalError?: Error;
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

function isNonReplayableStream(body: StreamingBlobPayloadInputTypes): boolean {
  if (body === null || body === undefined) return false;
  if (typeof body === 'string') return false;
  if (body instanceof Buffer) return false;
  if (body instanceof Uint8Array) return false;

  return typeof (body as NodeJS.ReadableStream).pipe === 'function' ||
    typeof (body as ReadableStream).getReader === 'function';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

export async function uploadWithRetry(
  key: string,
  body: StreamingBlobPayloadInputTypes,
  contentType: string,
  metadata: Record<string, string>,
  contentLength?: number,
  cacheControl?: string
): Promise<void> {
  let lastError: Error | null = null;

  const canRetry = !isNonReplayableStream(body);
  const maxAttempts = canRetry ? MAX_RETRIES : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
          ...(cacheControl ? { CacheControl: cacheControl } : {}),
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
        { error: lastError, key, attempt: attempt + 1, canRetry },
        'S3 upload attempt failed'
      );
    }
  }

  throw createS3UploadError(
    `S3 upload failed after ${maxAttempts} attempts`,
    key,
    false,
    lastError!
  );
}

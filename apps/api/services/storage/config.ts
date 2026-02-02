import { S3Client } from '@aws-sdk/client-s3';

export const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
export const REGION = process.env.AWS_REGION;
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1000;
export const MAX_KEY_LENGTH = 1024;

export const s3Client = new S3Client({
  region: REGION,
  maxAttempts: MAX_RETRIES,
});

export function isS3Configured(): boolean {
  return Boolean(BUCKET_NAME && REGION);
}

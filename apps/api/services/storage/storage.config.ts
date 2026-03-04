import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { config } from "../../app.config.js";

export const BUCKET_NAME = config.aws.s3Bucket;
export const REGION = config.aws.region;
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1000;
export const MAX_KEY_LENGTH = 1024;
const AWS_CREDENTIALS = config.aws.credentials;

export const awsClientConfig: S3ClientConfig = {
  region: REGION,
  maxAttempts: MAX_RETRIES,
  ...(AWS_CREDENTIALS ? { credentials: AWS_CREDENTIALS } : {}),
};

export const s3Client = new S3Client(awsClientConfig);

export function isS3Configured(): boolean {
  return Boolean(BUCKET_NAME && REGION);
}

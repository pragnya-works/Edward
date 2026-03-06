import { S3Client } from "@aws-sdk/client-s3";
import { config } from "../../app.config.js";

export const BUCKET_NAME = config.aws.s3Bucket;
export const REGION = config.aws.region;
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1000;
export const MAX_KEY_LENGTH = 1024;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function buildDefaultAwsPublicUrl(): string | null {
  const bucket = BUCKET_NAME?.trim();
  if (!bucket || config.aws.endpoint) {
    return null;
  }

  if (REGION === "us-east-1") {
    return `https://${bucket}.s3.amazonaws.com`;
  }

  return `https://${bucket}.s3.${REGION}.amazonaws.com`;
}

export function getPublicAssetBaseUrl(): string | null {
  const configured = config.aws.assetsUrl?.trim();
  if (configured) {
    return trimTrailingSlash(configured);
  }

  return buildDefaultAwsPublicUrl();
}

const credentials =
  config.aws.accessKeyId && config.aws.secretAccessKey
    ? {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      }
    : undefined;

export const s3Client = new S3Client({
  region: REGION,
  endpoint: config.aws.endpoint,
  maxAttempts: MAX_RETRIES,
  credentials,
  forcePathStyle: Boolean(config.aws.endpoint),
});

export function isS3Configured(): boolean {
  return Boolean(BUCKET_NAME && REGION);
}

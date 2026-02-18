import { nanoid } from "nanoid";
import { config } from "../../config.js";
import { uploadWithRetry } from "./upload.js";
import { sanitizePathComponent } from "./key.utils.js";
import type { AllowedImageMimeType } from "../../utils/imageValidation.js";

const CDN_BUCKET = config.aws.s3CdnBucket;
const ASSETS_BASE_URL = config.aws.assetsUrl?.replace(/\/$/, "");

const EXT_BY_MIME: Record<AllowedImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function buildCdnAssetUrl(key: string): string {
  return `${ASSETS_BASE_URL}/${key}`;
}

export async function uploadUserImageToCdn(
  userId: string,
  fileBuffer: Buffer,
  mimeType: AllowedImageMimeType,
  originalFileName?: string,
): Promise<{ key: string; url: string }> {
  const safeUserId = sanitizePathComponent(userId);
  const ext = EXT_BY_MIME[mimeType];
  const safeName = sanitizePathComponent(
    (originalFileName || "image").replace(/\.[^/.]+$/, ""),
  );
  const unique = nanoid(12);
  const fileName = `${Date.now()}-${safeName || "image"}-${unique}.${ext}`;
  const key = `chat-assets/${safeUserId}/${fileName}`;

  await uploadWithRetry(
    key,
    fileBuffer,
    mimeType,
    {
      userId: safeUserId,
      originalFileName: originalFileName || "image",
      uploadedAt: new Date().toISOString(),
      scope: "chat-image",
    },
    fileBuffer.length,
    "public, max-age=31536000, immutable",
    CDN_BUCKET,
  );

  return {
    key,
    url: buildCdnAssetUrl(key),
  };
}
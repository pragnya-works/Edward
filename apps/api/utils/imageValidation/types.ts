import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";

export type AllowedImageMimeType =
  (typeof IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES)[number];

export interface ValidatedImage {
  base64: string;
  mimeType: AllowedImageMimeType;
  sizeBytes: number;
  sourceUrl?: string;
}

export interface ImageValidationError {
  field: string;
  message: string;
}

export const MAX_BASE64_LENGTH =
  Math.ceil((IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES * 4) / 3) + 100;

export const MIME_SIGNATURES: Record<AllowedImageMimeType, Buffer> = {
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff]),
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": Buffer.from([0x52, 0x49, 0x46, 0x46]),
};

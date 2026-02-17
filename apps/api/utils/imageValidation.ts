import { z } from "zod";
import {
  IMAGE_UPLOAD_CONFIG
} from "@edward/shared/constants";

export type AllowedImageMimeType = (typeof IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES)[number];

const MAX_BASE64_LENGTH =
  Math.ceil((IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES * 4) / 3) + 100;
const IMAGE_FETCH_TIMEOUT_MS = 10_000;

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

const MIME_SIGNATURES: Record<AllowedImageMimeType, Buffer> = {
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff]),
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": Buffer.from([0x52, 0x49, 0x46, 0x46]),
};

function isValidBase64(str: string): boolean {
  if (!str || str.length === 0) return false;
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  return base64Regex.test(str);
}

function detectMimeTypeFromBuffer(buffer: Buffer): AllowedImageMimeType | null {
  for (const [mimeType, signature] of Object.entries(MIME_SIGNATURES)) {
    if (buffer.length >= signature.length) {
      const slice = buffer.subarray(0, signature.length);
      if (slice.equals(signature)) {
        if (mimeType === "image/webp" && buffer.length >= 12) {
          const webpSignature = buffer.subarray(8, 12);
          if (!webpSignature.equals(Buffer.from([0x57, 0x45, 0x42, 0x50]))) {
            continue;
          }
        }
        return mimeType as AllowedImageMimeType;
      }
    }
  }
  return null;
}

function ensureMimeMatch(
  detectedMimeType: AllowedImageMimeType,
  declaredMimeType?: string,
): ImageValidationError | null {
  if (!declaredMimeType) return null;
  if (declaredMimeType === detectedMimeType) return null;
  return {
    field: "mimeType",
    message: `Declared MIME type (${declaredMimeType}) does not match detected format (${detectedMimeType})`,
  };
}

export function validateImageBuffer(
  buffer: Buffer,
  declaredMimeType?: string,
):
  | { success: true; data: Omit<ValidatedImage, "sourceUrl"> }
  | { success: false; error: ImageValidationError } {
  if (!buffer || buffer.length === 0) {
    return {
      success: false,
      error: { field: "buffer", message: "Image data is required" },
    };
  }

  const sizeBytes = buffer.byteLength;
  if (sizeBytes > IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES) {
    return {
      success: false,
      error: {
        field: "buffer",
        message: `Image size (${(sizeBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed (${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB)`,
      },
    };
  }

  const detectedMimeType = detectMimeTypeFromBuffer(buffer);
  if (!detectedMimeType) {
    return {
      success: false,
      error: {
        field: "mimeType",
        message:
          "Could not detect image format. Only JPEG, PNG, and WebP are supported.",
      },
    };
  }

  const mimeError = ensureMimeMatch(detectedMimeType, declaredMimeType);
  if (mimeError) {
    return { success: false, error: mimeError };
  }

  return {
    success: true,
    data: {
      base64: buffer.toString("base64"),
      mimeType: detectedMimeType,
      sizeBytes,
    },
  };
}

export function validateBase64Image(
  base64: string,
  declaredMimeType?: string,
):
  | { success: true; data: Omit<ValidatedImage, "sourceUrl"> }
  | { success: false; error: ImageValidationError } {
  if (!base64 || typeof base64 !== "string") {
    return {
      success: false,
      error: { field: "base64", message: "Image data is required" },
    };
  }

  if (!isValidBase64(base64)) {
    return {
      success: false,
      error: { field: "base64", message: "Invalid base64 encoding" },
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return {
      success: false,
      error: { field: "base64", message: "Failed to decode base64 data" },
    };
  }

  const validated = validateImageBuffer(buffer, declaredMimeType);
  if (!validated.success) return validated;
  return { success: true, data: validated.data };
}

export async function validateImageUrl(
  url: string,
  declaredMimeType?: string,
): Promise<
  | { success: true; data: ValidatedImage }
  | { success: false; error: ImageValidationError }
> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      success: false,
      error: { field: "url", message: "Invalid image URL" },
    };
  }

  if (!["https:", "http:"].includes(parsedUrl.protocol)) {
    return {
      success: false,
      error: {
        field: "url",
        message: "Only HTTP/HTTPS image URLs are allowed",
      },
    };
  }

  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    IMAGE_FETCH_TIMEOUT_MS,
  );

  try {
    const response = await fetch(parsedUrl.toString(), {
      signal: abortController.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        success: false,
        error: {
          field: "url",
          message: `Failed to fetch image: HTTP ${response.status}`,
        },
      };
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (
        !Number.isNaN(contentLength) &&
        contentLength > IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES
      ) {
        return {
          success: false,
          error: {
            field: "url",
            message: `Image size (${(contentLength / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed (${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB)`,
          },
        };
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const validated = validateImageBuffer(buffer, declaredMimeType);
    if (!validated.success) {
      return validated;
    }

    return {
      success: true,
      data: {
        ...validated.data,
        sourceUrl: parsedUrl.toString(),
      },
    };
  } catch {
    return {
      success: false,
      error: { field: "url", message: "Failed to fetch image from URL" },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function validateImageCount(
  images: unknown[],
): ImageValidationError | null {
  if (images.length > IMAGE_UPLOAD_CONFIG.MAX_FILES) {
    return {
      field: "images",
      message: `Maximum ${IMAGE_UPLOAD_CONFIG.MAX_FILES} images allowed per message, received ${images.length}`,
    };
  }
  return null;
}

export const ImageContentBase64Schema = z.object({
  type: z.literal("image"),
  base64: z
    .string()
    .max(
      MAX_BASE64_LENGTH,
      `Image too large. Maximum size is ${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB`,
    ),
  mimeType: z.enum(IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES),
});

const ImageContentUrlSchema = z.object({
  type: z.literal("image"),
  url: z.string().url(),
  mimeType: z.enum(IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES).optional(),
});

const ImageContentSchema = z.union([
  ImageContentBase64Schema,
  ImageContentUrlSchema,
]);

export const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1, "Text content cannot be empty"),
});

export const MessageContentPartSchema = z.union([
  TextContentSchema,
  ImageContentSchema,
]);

export const MultimodalContentSchema = z
  .array(MessageContentPartSchema)
  .max(
    IMAGE_UPLOAD_CONFIG.MAX_FILES + 1,
    `Maximum ${IMAGE_UPLOAD_CONFIG.MAX_FILES + 1} content parts allowed`,
  )
  .refine(
    (parts) =>
      parts.filter(
        (p): p is z.infer<typeof ImageContentSchema> => p.type === "image",
      ).length <= IMAGE_UPLOAD_CONFIG.MAX_FILES,
    { message: `Maximum ${IMAGE_UPLOAD_CONFIG.MAX_FILES} images allowed per message` },
  )
  .refine(
    (parts) =>
      parts.some((p) => p.type === "text" && p.text.trim().length > 0) ||
      parts.some((p) => p.type === "image"),
    { message: "Message must contain text or at least one image" },
  );

import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";
import type {
  AllowedImageMimeType,
  ImageValidationError,
  ValidatedImage,
} from "./types.js";
import { MIME_SIGNATURES } from "./types.js";

function isValidBase64(str: string): boolean {
  if (!str || str.length === 0) return false;
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  return base64Regex.test(str);
}

function detectMimeTypeFromBuffer(buffer: Buffer): AllowedImageMimeType | null {
  for (const [mimeType, signature] of Object.entries(MIME_SIGNATURES)) {
    if (buffer.length < signature.length) {
      continue;
    }

    const slice = buffer.subarray(0, signature.length);
    if (!slice.equals(signature)) {
      continue;
    }

    if (mimeType === "image/webp" && buffer.length >= 12) {
      const webpSignature = buffer.subarray(8, 12);
      if (!webpSignature.equals(Buffer.from([0x57, 0x45, 0x42, 0x50]))) {
        continue;
      }
    }

    return mimeType as AllowedImageMimeType;
  }

  return null;
}

function ensureMimeMatch(
  detectedMimeType: AllowedImageMimeType,
  declaredMimeType?: string,
): ImageValidationError | null {
  if (!declaredMimeType || declaredMimeType === detectedMimeType) {
    return null;
  }

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
  if (!validated.success) {
    return validated;
  }

  return { success: true, data: validated.data };
}

export function validateImageCount(images: unknown[]): ImageValidationError | null {
  if (images.length > IMAGE_UPLOAD_CONFIG.MAX_FILES) {
    return {
      field: "images",
      message: `Maximum ${IMAGE_UPLOAD_CONFIG.MAX_FILES} images allowed per message, received ${images.length}`,
    };
  }
  return null;
}

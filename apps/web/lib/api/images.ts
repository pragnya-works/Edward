import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";
import { fetchApiResponse } from "@/lib/api/httpClient";
import type {
  UploadedImage,
  UploadableImageMimeType,
} from "@/lib/api/messageContent";

interface UploadImageResponse {
  message: string;
  data: {
    url: string;
    key: string;
    mimeType: UploadableImageMimeType;
    sizeBytes: number;
  };
  timestamp: string;
}

function validateFile(file: File): { valid: boolean; error?: string } {
  if (
    !IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES.includes(
      file.type as UploadableImageMimeType,
    )
  ) {
    return {
      valid: false,
      error: `File type ${file.type} not supported. Use JPEG, PNG, or WebP.`,
    };
  }
  if (file.size > IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: `File ${file.name} exceeds ${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB limit.`,
    };
  }
  return { valid: true };
}

export async function uploadImageToCdn(file: File): Promise<UploadedImage> {
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid file");
  }

  const response = await fetchApiResponse("/chat/image-upload", {
    method: "POST",
    body: file,
    headers: {
      "Content-Type": file.type || "image/jpeg",
      "x-file-name": encodeURIComponent(file.name),
    },
  });

  const result = (await response.json()) as UploadImageResponse;
  return {
    url: result.data.url,
    mimeType: result.data.mimeType,
    name: file.name,
    sizeBytes: result.data.sizeBytes,
  };
}

import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";
import { normalizeUserMessageText } from "@/lib/userMessageText";

export type UploadableImageMimeType =
  (typeof IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES)[number];

export enum MessageContentPartType {
  TEXT = "text",
  IMAGE = "image",
}

export type MessageContentPart =
  | { type: MessageContentPartType.TEXT; text: string }
  | { type: MessageContentPartType.IMAGE; url: string; mimeType?: string };

export type MessageContent = string | MessageContentPart[];

export interface UploadedImage {
  url: string;
  mimeType: string;
  name?: string;
  sizeBytes?: number;
}

function normalizeImageMimeType(
  mimeType?: string,
): UploadableImageMimeType | undefined {
  if (!mimeType) return undefined;
  if (
    IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES.includes(
      mimeType as UploadableImageMimeType,
    )
  ) {
    return mimeType as UploadableImageMimeType;
  }
  console.warn(
    `Image type ${mimeType} not supported. Sending URL without mime.`,
  );
  return undefined;
}

export async function filesToMessageContent(
  text: string,
  images: UploadedImage[],
): Promise<MessageContent> {
  const normalizedText = normalizeUserMessageText(text);
  const uploadedImages = images
    .slice(0, IMAGE_UPLOAD_CONFIG.MAX_FILES)
    .map((image) => ({
      ...image,
      url: image.url?.trim(),
      mimeType: normalizeImageMimeType(image.mimeType),
    }))
    .filter((image) => Boolean(image.url));

  if (uploadedImages.length === 0) return normalizedText;

  if (uploadedImages.length === 1 && !normalizedText) {
    return [
      {
        type: MessageContentPartType.IMAGE,
        url: uploadedImages[0]!.url,
        mimeType: uploadedImages[0]!.mimeType,
      },
    ];
  }

  const parts: MessageContentPart[] = [];

  if (normalizedText) {
    parts.push({ type: MessageContentPartType.TEXT, text: normalizedText });
  }

  parts.push(
    ...uploadedImages.map((image) => ({
      type: MessageContentPartType.IMAGE as const,
      url: image.url,
      mimeType: image.mimeType,
    })),
  );

  return parts;
}

import { nanoid } from "nanoid";
import { logger } from "../../utils/logger.js";
import {
  validateBase64Image,
  validateImageUrl,
  type AllowedImageMimeType,
  type ValidatedImage,
} from "../../utils/imageValidation.js";
import type { MessageContentPart } from "../../schemas/chat.schema.js";
import type { ImageAttachment } from "../../services/chat.service.js";

export interface ParsedMultimodalContent {
  textContent: string;
  images: ValidatedImage[];
  multimodalParts?: MessageContentPart[];
  hasImages: boolean;
}

export async function parseMultimodalContent(
  content: unknown,
): Promise<ParsedMultimodalContent> {
  if (typeof content === "string") {
    return {
      textContent: content,
      images: [],
      hasImages: false,
    };
  }

  if (!Array.isArray(content)) {
    return {
      textContent: String(content),
      images: [],
      hasImages: false,
    };
  }

  const parts = content as MessageContentPart[];
  const textParts: string[] = [];
  const images: ValidatedImage[] = [];

  for (const part of parts) {
    if (part.type === "text" && part.text.trim()) {
      textParts.push(part.text);
    } else if (part.type === "image") {
      if ("url" in part && typeof part.url === "string") {
        const result = await validateImageUrl(part.url, part.mimeType);
        if (result.success) {
          images.push(result.data);
        } else {
          logger.warn(
            { error: result.error },
            "Skipping invalid image URL in multimodal content",
          );
        }
        continue;
      }

      if ("base64" in part && typeof part.base64 === "string") {
        const result = validateBase64Image(part.base64, part.mimeType);
        if (result.success) {
          images.push(result.data);
        } else {
          logger.warn(
            { error: result.error },
            "Skipping invalid image in multimodal content",
          );
        }
      }
    }
  }

  const textContent = textParts.join(" ").trim();

  return {
    textContent,
    images,
    multimodalParts: parts,
    hasImages: images.length > 0,
  };
}

export function buildMultimodalContentForLLM(
  textContent: string,
  images: ValidatedImage[],
): Array<
  | { type: "text"; text: string }
  | { type: "image"; base64: string; mimeType: AllowedImageMimeType }
> {
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image"; base64: string; mimeType: AllowedImageMimeType }
  > = [];

  if (textContent) {
    parts.push({ type: "text", text: textContent });
  }

  for (const image of images) {
    parts.push({
      type: "image",
      base64: image.base64,
      mimeType: image.mimeType,
    });
  }

  return parts;
}

export function toImageAttachments(images: ValidatedImage[]): ImageAttachment[] {
  return images.map((img) => ({
    url: img.sourceUrl || `data:${img.mimeType};base64,${img.base64}`,
    mimeType: img.mimeType,
    name: img.sourceUrl
      ? undefined
      : `image-${nanoid(8)}.${img.mimeType.split("/")[1]}`,
  }));
}

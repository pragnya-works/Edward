import { IMAGE_UPLOAD_CONFIG } from "../constants.js";

export type AllowedImageMimeType =
  (typeof IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES)[number];

export interface VisionImage {
  type: "image";
  base64: string;
  mimeType: AllowedImageMimeType;
}

export interface TextContent {
  type: "text";
  text: string;
}

export type MessageContentPart = VisionImage | TextContent;

export type MessageContent = string | MessageContentPart[];

export function isMultimodalContent(
  content: string | MessageContentPart[],
): content is MessageContentPart[] {
  return Array.isArray(content);
}

export function getTextFromContent(
  content: string | MessageContentPart[],
): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .filter((part): part is TextContent => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function hasImages(content: string | MessageContentPart[]): boolean {
  if (typeof content === "string") {
    return false;
  }

  return content.some((part) => part.type === "image");
}

import type {
  MessageContentPart,
} from "@edward/shared/llm/types";
import {
  getTextFromContent as getSharedTextFromContent,
  hasImages as hasSharedImages,
  isMultimodalContent as isSharedMultimodalContent,
} from "@edward/shared/llm/types";

type VisionImage = Extract<MessageContentPart, { type: "image" }>;

export function isMultimodalContent(
  content: string | MessageContentPart[],
): content is MessageContentPart[] {
  return isSharedMultimodalContent(content);
}

export function getTextFromContent(
  content: string | MessageContentPart[],
): string {
  return getSharedTextFromContent(content);
}

export function hasImages(content: string | MessageContentPart[]): boolean {
  return hasSharedImages(content);
}

export type OpenAIContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    };

export function formatContentForOpenAI(
  content: string | MessageContentPart[],
): OpenAIContentPart[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }

  return content.map((part) => {
    if (part.type === "image") {
      const image = part as VisionImage;
      return {
        type: "image_url" as const,
        image_url: {
          url: `data:${image.mimeType};base64,${image.base64}`,
        },
      };
    }

    return {
      type: "text" as const,
      text: part.text,
    };
  });
}

export type GeminiContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export function formatContentForGemini(
  content: string | MessageContentPart[],
): GeminiContentPart[] {
  if (typeof content === "string") {
    return [{ text: content }];
  }

  return content.map((part): GeminiContentPart => {
    if (part.type === "image") {
      const image = part as VisionImage;
      return {
        inlineData: {
          mimeType: image.mimeType,
          data: image.base64,
        },
      };
    }

    return { text: part.text };
  });
}

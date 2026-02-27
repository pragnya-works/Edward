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

export type OpenAIResponsesContentPart =
  | {
      type: "input_text";
      text: string;
    }
  | {
      type: "input_image";
      image_url: string;
      detail: "auto";
    };

export function formatContentForOpenAIResponses(
  content: string | MessageContentPart[],
): OpenAIResponsesContentPart[] {
  if (typeof content === "string") {
    return [{ type: "input_text", text: content }];
  }

  return content.map((part) => {
    if (part.type === "image") {
      const image = part as VisionImage;
      return {
        type: "input_image" as const,
        image_url: `data:${image.mimeType};base64,${image.base64}`,
        detail: "auto" as const,
      };
    }

    return {
      type: "input_text" as const,
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

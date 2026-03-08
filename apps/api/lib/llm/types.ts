import type {
  MessageContentPart,
} from "@edward/shared/llm/types";

type VisionImage = Extract<MessageContentPart, { type: "image" }>;
type AnthropicImageMediaType =
  | "image/gif"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

function toAnthropicImageMediaType(mimeType: string): AnthropicImageMediaType {
  switch (mimeType) {
    case "image/gif":
    case "image/jpeg":
    case "image/png":
    case "image/webp":
      return mimeType;
    default:
      throw new Error(`Unsupported Anthropic image mime type: ${mimeType}`);
  }
}

export function isMultimodalContent(
  content: string | MessageContentPart[],
): content is MessageContentPart[] {
  return typeof content !== "string";
}

export function getTextFromContent(content: string | MessageContentPart[]): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .filter((part): part is Extract<MessageContentPart, { type: "text" }> =>
      part.type === "text"
    )
    .map((part) => part.text)
    .join("\n");
}

export function hasImages(content: string | MessageContentPart[]): boolean {
  return Array.isArray(content) && content.some((part) => part.type === "image");
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

export type AnthropicContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: AnthropicImageMediaType;
        data: string;
      };
    };

export function formatContentForAnthropic(
  content: string | MessageContentPart[],
): AnthropicContentPart[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }

  return content.map((part): AnthropicContentPart => {
    if (part.type === "image") {
      const image = part as VisionImage;
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: toAnthropicImageMediaType(image.mimeType),
          data: image.base64,
        },
      };
    }

    return {
      type: "text",
      text: part.text,
    };
  });
}

export interface VisionImage {
  type: "image";
  base64: string;
  mimeType: string;
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
      return {
        type: "image_url" as const,
        image_url: {
          url: `data:${part.mimeType};base64,${part.base64}`,
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
      return {
        inlineData: {
          mimeType: part.mimeType,
          data: part.base64,
        },
      };
    }
    return { text: part.text };
  });
}

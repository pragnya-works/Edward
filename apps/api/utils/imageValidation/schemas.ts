import { z } from "zod";
import { IMAGE_UPLOAD_CONFIG, PROMPT_INPUT_CONFIG } from "@edward/shared/constants";
import { MAX_BASE64_LENGTH } from "./types.js";

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
  text: z
    .string()
    .min(1, "Text content cannot be empty")
    .max(
      PROMPT_INPUT_CONFIG.MAX_CHARS,
      `Text content exceeds ${PROMPT_INPUT_CONFIG.MAX_CHARS} characters`,
    ),
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
        (part): part is z.infer<typeof ImageContentSchema> => part.type === "image",
      ).length <= IMAGE_UPLOAD_CONFIG.MAX_FILES,
    {
      message: `Maximum ${IMAGE_UPLOAD_CONFIG.MAX_FILES} images allowed per message`,
    },
  )
  .refine(
    (parts) =>
      parts.some((part) => part.type === "text" && part.text.trim().length > 0) ||
      parts.some((part) => part.type === "image"),
    { message: "Message must contain text or at least one image" },
  );

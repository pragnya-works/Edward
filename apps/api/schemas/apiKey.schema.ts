import { z } from "zod";
import { Model } from "@edward/shared/schema";

const ModelValues = Object.values(Model) as [string, ...string[]];

export const ApiKeySchema = z
  .object({
    apiKey: z
      .string()
      .min(20, "API key must be at least 20 characters")
      .max(500, "API key cannot exceed 500 characters")
      .optional(),
    model: z.enum(ModelValues).optional(),
  })
  .refine((data) => data.apiKey || data.model, {
    message: "Either apiKey or model must be provided",
    path: ["apiKey"],
  });

export const ApiKeyDataSchema = z.object({
  hasApiKey: z.boolean(),
  userId: z.string(),
  keyPreview: z.string().optional(),
  preferredModel: z.enum(ModelValues),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateApiKeyRequestSchema = z.object({
  body: ApiKeySchema,
});

export const UpdateApiKeyRequestSchema = z.object({
  body: ApiKeySchema,
});

export type GetApiKeyResponse = {
  message: string;
  data: z.infer<typeof ApiKeyDataSchema>;
  timestamp: string;
};

export type CreateApiKeyResponse = {
  message: string;
  data: {
    userId: string;
    keyPreview: string;
  };
  timestamp: string;
};

export type UpdateApiKeyResponse = {
  message: string;
  data: {
    userId: string;
    keyPreview: string;
  };
  timestamp: string;
};

export type DeleteApiKeyResponse = {
  message: string;
  timestamp: string;
};

export type ErrorResponse = {
  error: string;
  details?: Array<{
    path: Array<string | number>;
    message: string;
  }>;
  timestamp: string;
};

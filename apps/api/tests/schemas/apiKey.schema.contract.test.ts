import { describe, expect, it } from "vitest";
import {
  ApiKeyDataSchema,
  CreateApiKeyRequestSchema,
  UpdateApiKeyRequestSchema,
} from "../../schemas/apiKey.schema.js";
import { Model } from "@edward/shared/schema";

describe("api key schema contract", () => {
  it("accepts create request with valid key length", () => {
    const result = CreateApiKeyRequestSchema.safeParse({
      body: {
        apiKey: "k".repeat(32),
        model: Model.GPT_5_3_CODEX,
      },
    });

    expect(result.success).toBe(true);
  });

  it("requires either apiKey or model on update payload", () => {
    const invalid = UpdateApiKeyRequestSchema.safeParse({ body: {} });
    expect(invalid.success).toBe(false);

    const validWithModelOnly = UpdateApiKeyRequestSchema.safeParse({
      body: {
        model: Model.GEMINI_2_5_FLASH,
      },
    });
    expect(validWithModelOnly.success).toBe(true);
  });

  it("rejects update payload with an invalid model value", () => {
    const invalidModel = UpdateApiKeyRequestSchema.safeParse({
      body: {
        model: "invalid-model",
      },
    });
    expect(invalidModel.success).toBe(false);
  });

  it("validates stored API key data shape", () => {
    const result = ApiKeyDataSchema.safeParse({
      hasApiKey: true,
      userId: "user-1",
      keyPreview: "sk-****abcd",
      preferredModel: Model.GPT_5_2_CODEX,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(result.success).toBe(true);
  });
});

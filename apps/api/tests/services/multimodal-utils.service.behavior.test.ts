import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ValidatedImage } from "../../utils/imageValidation/types.js";
import {
  buildMultimodalContentForLLM,
  parseMultimodalContent,
  toImageAttachments,
} from "../../services/multimodal-utils/service.js";

const refs = vi.hoisted(() => ({
  validateBase64Image: vi.fn(),
  validateImageUrl: vi.fn(),
  warn: vi.fn(),
  nanoid: vi.fn(() => "abc12345"),
}));

vi.mock("../../utils/imageValidation/binary.js", () => ({
  validateBase64Image: refs.validateBase64Image,
}));

vi.mock("../../utils/imageValidation/network.js", () => ({
  validateImageUrl: refs.validateImageUrl,
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    warn: refs.warn,
  },
}));

vi.mock("nanoid", () => ({
  nanoid: refs.nanoid,
}));

describe("multimodal utils behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses text-only content and normalizes whitespace", async () => {
    const result = await parseMultimodalContent("   Build\n\nDashboard   ");

    expect(result).toEqual({
      textContent: "Build\n\nDashboard",
      images: [],
      hasImages: false,
    });
  });

  it("parses mixed content and skips invalid images", async () => {
    const validUrlImage: ValidatedImage = {
      base64: "abcd",
      mimeType: "image/png",
      sizeBytes: 4,
      sourceUrl: "https://cdn.example.com/hero.png",
    };

    refs.validateImageUrl.mockResolvedValueOnce({
      success: true,
      data: validUrlImage,
    });
    refs.validateBase64Image.mockReturnValueOnce({
      success: false,
      error: { field: "content", message: "invalid" },
    });

    const result = await parseMultimodalContent([
      { type: "text", text: "Generate layout" },
      { type: "image", url: "https://cdn.example.com/hero.png", mimeType: "image/png" },
      { type: "image", base64: "bad", mimeType: "image/png" },
    ]);

    expect(result.textContent).toBe("Generate layout");
    expect(result.images).toEqual([validUrlImage]);
    expect(result.hasImages).toBe(true);
    expect(refs.warn).toHaveBeenCalledTimes(1);
  });

  it("builds LLM parts with text, URL context, and images", () => {
    const parts = buildMultimodalContentForLLM("Use this image", [
      {
        base64: "ZmFrZQ==",
        mimeType: "image/png",
        sizeBytes: 4,
        sourceUrl: "https://cdn.example.com/image-a.png",
      },
    ]);

    expect(parts[0]).toEqual({ type: "text", text: "Use this image" });
    expect(parts[1]).toEqual({
      type: "text",
      text: "Attached image URLs:\n1. https://cdn.example.com/image-a.png",
    });
    expect(parts[2]).toEqual({
      type: "image",
      base64: "ZmFrZQ==",
      mimeType: "image/png",
    });
  });

  it("creates image attachments with deterministic names for base64 inputs", () => {
    const attachments = toImageAttachments([
      {
        base64: "ZmFrZQ==",
        mimeType: "image/png",
        sizeBytes: 4,
      },
      {
        base64: "YmFy",
        mimeType: "image/jpeg",
        sizeBytes: 3,
        sourceUrl: "https://cdn.example.com/banner.jpg",
      },
    ]);

    expect(attachments[0]).toEqual({
      url: "data:image/png;base64,ZmFrZQ==",
      mimeType: "image/png",
      name: "image-abc12345.png",
    });
    expect(attachments[1]).toEqual({
      url: "https://cdn.example.com/banner.jpg",
      mimeType: "image/jpeg",
      name: undefined,
    });
  });
});

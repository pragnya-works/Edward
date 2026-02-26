import { describe, expect, it } from "vitest";
import {
  buildMultimodalContentForLLM,
} from "../../services/multimodal.utils/service.js";

describe("buildMultimodalContentForLLM", () => {
  it("adds image URL context text when source URLs are present", () => {
    const parts = buildMultimodalContentForLLM("Use this image in hero section", [
      {
        base64: "ZmFrZQ==",
        mimeType: "image/png",
        sizeBytes: 4,
        sourceUrl: "https://cdn.example.com/image-a.png",
      },
      {
        base64: "bW9yZQ==",
        mimeType: "image/jpeg",
        sizeBytes: 4,
        sourceUrl: "https://cdn.example.com/image-b.jpg",
      },
    ]);

    expect(parts[0]).toEqual({
      type: "text",
      text: "Use this image in hero section",
    });
    expect(parts[1]).toEqual({
      type: "text",
      text:
        "Attached image URLs:\n1. https://cdn.example.com/image-a.png\n2. https://cdn.example.com/image-b.jpg",
    });
    expect(parts[2]).toMatchObject({ type: "image", mimeType: "image/png" });
    expect(parts[3]).toMatchObject({ type: "image", mimeType: "image/jpeg" });
  });

  it("does not add URL context when source URLs are absent", () => {
    const parts = buildMultimodalContentForLLM("", [
      {
        base64: "ZmFrZQ==",
        mimeType: "image/png",
        sizeBytes: 4,
      },
    ]);

    expect(parts).toEqual([
      {
        type: "image",
        base64: "ZmFrZQ==",
        mimeType: "image/png",
      },
    ]);
  });
});

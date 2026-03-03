import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";
import { validateImageUrl } from "../../../utils/imageValidation/network.js";

const refs = vi.hoisted(() => ({
  fetchWithSafeRedirects: vi.fn(),
  cancelResponseBody: vi.fn(async () => undefined),
  readResponseBufferWithLimit: vi.fn(),
  validateImageBuffer: vi.fn(),
}));

vi.mock("../../../services/network/safeFetch.js", () => ({
  fetchWithSafeRedirects: refs.fetchWithSafeRedirects,
  cancelResponseBody: refs.cancelResponseBody,
  readResponseBufferWithLimit: refs.readResponseBufferWithLimit,
}));

vi.mock("../../../utils/imageValidation/binary.js", () => ({
  validateImageBuffer: refs.validateImageBuffer,
}));

type MockResponse = {
  ok: boolean;
  status: number;
  headers: {
    get: (name: string) => string | null;
  };
};

describe("validateImageUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid URL formats and non-http protocols", async () => {
    await expect(validateImageUrl("not-a-url")).resolves.toEqual({
      success: false,
      error: { field: "url", message: "Invalid image URL" },
    });

    await expect(validateImageUrl("ftp://example.com/image.png")).resolves.toEqual({
      success: false,
      error: {
        field: "url",
        message: "Only HTTP/HTTPS image URLs are allowed",
      },
    });
  });

  it("returns HTTP error when fetch response is not ok", async () => {
    refs.fetchWithSafeRedirects.mockResolvedValueOnce({
      response: {
        ok: false,
        status: 502,
        headers: { get: () => null },
      } as MockResponse,
      finalUrl: new URL("https://cdn.example.com/final.png"),
    });

    const result = await validateImageUrl("https://cdn.example.com/image.png");

    expect(result).toEqual({
      success: false,
      error: {
        field: "url",
        message: "Failed to fetch image: HTTP 502",
      },
    });
    expect(refs.cancelResponseBody).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized content-length before buffering", async () => {
    refs.fetchWithSafeRedirects.mockResolvedValueOnce({
      response: {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "content-length" ? String(11 * 1024 * 1024) : null,
        },
      } as MockResponse,
      finalUrl: new URL("https://cdn.example.com/final.png"),
    });

    const result = await validateImageUrl("https://cdn.example.com/image.png");

    expect(result.success).toBe(false);
    expect(refs.cancelResponseBody).toHaveBeenCalledTimes(1);
  });

  it("returns specific size-limit error when capped buffer read fails", async () => {
    refs.fetchWithSafeRedirects.mockResolvedValueOnce({
      response: {
        ok: true,
        status: 200,
        headers: { get: () => null },
      } as MockResponse,
      finalUrl: new URL("https://cdn.example.com/final.png"),
    });

    const sizeError = new Error("too large");
    sizeError.name = "ImageSizeLimitError";
    refs.readResponseBufferWithLimit.mockRejectedValueOnce(sizeError);

    const result = await validateImageUrl("https://cdn.example.com/image.png");

    expect(result).toEqual({
      success: false,
      error: {
        field: "url",
        message: `Image size exceeds maximum allowed (${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB)`,
      },
    });
  });

  it("returns validation result from image buffer parser", async () => {
    refs.fetchWithSafeRedirects.mockResolvedValue({
      response: {
        ok: true,
        status: 200,
        headers: { get: () => null },
      } as MockResponse,
      finalUrl: new URL("https://cdn.example.com/final.png"),
    });
    refs.readResponseBufferWithLimit.mockResolvedValue(Buffer.from("abc"));

    refs.validateImageBuffer.mockReturnValueOnce({
      success: false,
      error: { field: "content", message: "invalid image data" },
    });

    const invalid = await validateImageUrl("https://cdn.example.com/image.png");
    expect(invalid).toEqual({
      success: false,
      error: { field: "content", message: "invalid image data" },
    });

    refs.validateImageBuffer.mockReturnValueOnce({
      success: true,
      data: {
        base64: "ZmFrZQ==",
        mimeType: "image/png",
        sizeBytes: 4,
      },
    });

    const valid = await validateImageUrl("https://cdn.example.com/image.png");
    expect(valid).toEqual({
      success: true,
      data: {
        base64: "ZmFrZQ==",
        mimeType: "image/png",
        sizeBytes: 4,
        sourceUrl: "https://cdn.example.com/final.png",
      },
    });
  });

  it("returns generic fetch failure for unexpected errors", async () => {
    refs.fetchWithSafeRedirects.mockRejectedValueOnce(new Error("network down"));

    const result = await validateImageUrl("https://cdn.example.com/image.png");

    expect(result).toEqual({
      success: false,
      error: { field: "url", message: "Failed to fetch image from URL" },
    });
  });
});

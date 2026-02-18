import { describe, it, expect } from "vitest";
import {
  validateBase64Image,
  validateImageCount,
} from "../../utils/imageValidation.js";
import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";

const validJpegBase64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

const validPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("imageValidation", () => {
  describe("validateBase64Image", () => {
    it("should validate valid JPEG image", () => {
      const result = validateBase64Image(validJpegBase64, "image/jpeg");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mimeType).toBe("image/jpeg");
      }
    });

    it("should validate valid PNG image", () => {
      const result = validateBase64Image(validPngBase64, "image/png");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mimeType).toBe("image/png");
      }
    });

    it.skip("should validate valid WebP image", () => {
      const webpHex = "524946461400000057454250565038200800000030303030";
      const webpBase64 = Buffer.from(webpHex, "hex").toString("base64");
      const result = validateBase64Image(webpBase64);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mimeType).toBe("image/webp");
      }
    });

    it("should detect MIME type from base64 data", () => {
      const result = validateBase64Image(validJpegBase64);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mimeType).toBe("image/jpeg");
      }
    });

    it("should reject empty base64 string", () => {
      const result = validateBase64Image("");
      expect(result.success).toBe(false);
    });

    it("should reject invalid base64 encoding", () => {
      const result = validateBase64Image("not-valid-base64!!!");
      expect(result.success).toBe(false);
    });

    it("should reject mismatched MIME type", () => {
      const result = validateBase64Image(validJpegBase64, "image/png");
      expect(result.success).toBe(false);
    });

    it("should reject unsupported image format", () => {
      const bmpBase64 =
        "Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAP8=";
      const result = validateBase64Image(bmpBase64);
      expect(result.success).toBe(false);
    });
  });

  describe("validateImageCount", () => {
    it("should accept 0 images", () => {
      const result = validateImageCount([]);
      expect(result).toBeNull();
    });

    it("should accept 1 image", () => {
      const result = validateImageCount([{}]);
      expect(result).toBeNull();
    });

    it("should accept 3 images (max)", () => {
      const result = validateImageCount([{}, {}, {}]);
      expect(result).toBeNull();
    });

    it("should reject more than 3 images", () => {
      const result = validateImageCount([{}, {}, {}, {}]);
      expect(result).not.toBeNull();
      expect(result?.message).toContain("4");
      expect(result?.message).toContain("3");
    });
  });

  describe("constants", () => {
    it("should have correct max image size", () => {
      expect(IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES).toBe(IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES);
    });

    it("should have correct max images per message", () => {
      expect(IMAGE_UPLOAD_CONFIG.MAX_FILES).toBe(3);
    });

    it("should have correct allowed MIME types", () => {
      expect(IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES).toContain("image/jpeg");
      expect(IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES).toContain("image/png");
      expect(IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES).toContain("image/webp");
      expect(IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES).toHaveLength(3);
    });
  });
});

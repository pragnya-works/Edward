import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";
import {
  cancelResponseBody,
  fetchWithSafeRedirects,
  readResponseBufferWithLimit,
} from "../../services/network/safeFetch.js";
import { validateImageBuffer } from "./binary.js";
import type { ImageValidationError, ValidatedImage } from "./types.js";

const IMAGE_FETCH_TIMEOUT_MS = 10_000;

function createImageSizeLimitError(): Error {
  const error = new Error(
    `Image size exceeds maximum allowed (${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB)`,
  );
  error.name = "ImageSizeLimitError";
  return error;
}

export async function validateImageUrl(
  url: string,
  declaredMimeType?: string,
): Promise<
  | { success: true; data: ValidatedImage }
  | { success: false; error: ImageValidationError }
> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      success: false,
      error: { field: "url", message: "Invalid image URL" },
    };
  }

  if (!["https:", "http:"].includes(parsedUrl.protocol)) {
    return {
      success: false,
      error: {
        field: "url",
        message: "Only HTTP/HTTPS image URLs are allowed",
      },
    };
  }

  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    IMAGE_FETCH_TIMEOUT_MS,
  );

  try {
    const { response, finalUrl } = await fetchWithSafeRedirects(parsedUrl, {
      signal: abortController.signal,
      maxRedirects: 4,
      accept: "image/*",
      userAgent: "EdwardBot/1.0 (+https://www.pragnyaa.in)",
    });

    if (!response.ok) {
      await cancelResponseBody(response);
      return {
        success: false,
        error: {
          field: "url",
          message: `Failed to fetch image: HTTP ${response.status}`,
        },
      };
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (
        !Number.isNaN(contentLength) &&
        contentLength > IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES
      ) {
        await cancelResponseBody(response);
        return {
          success: false,
          error: {
            field: "url",
            message: `Image size (${(contentLength / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed (${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB)`,
          },
        };
      }
    }

    const buffer = await readResponseBufferWithLimit(
      response,
      IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES,
      createImageSizeLimitError(),
    );

    const validated = validateImageBuffer(buffer, declaredMimeType);
    if (!validated.success) {
      return validated;
    }

    return {
      success: true,
      data: {
        ...validated.data,
        sourceUrl: finalUrl.toString(),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "ImageSizeLimitError") {
      return {
        success: false,
        error: {
          field: "url",
          message: `Image size exceeds maximum allowed (${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB)`,
        },
      };
    }

    return {
      success: false,
      error: { field: "url", message: "Failed to fetch image from URL" },
    };
  } finally {
    clearTimeout(timeout);
  }
}

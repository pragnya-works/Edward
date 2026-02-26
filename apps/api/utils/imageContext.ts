import type { ValidatedImage } from "./imageValidation/types.js";

const MAX_IMAGE_URL_LENGTH = 2048;

function normalizeImageSourceUrl(input?: string): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  const normalized = parsed.toString();
  if (normalized.length > MAX_IMAGE_URL_LENGTH) {
    return normalized.slice(0, MAX_IMAGE_URL_LENGTH) + "...[truncated]";
  }
  return normalized;
}

export function buildAttachedImageUrlContextFromUrls(
  urls: Array<string | undefined>,
): string | null {
  const normalized = urls
    .map((url) => normalizeImageSourceUrl(url))
    .filter((url): url is string => Boolean(url));

  if (normalized.length === 0) return null;

  const unique = Array.from(new Set(normalized));
  const lines = unique.map((url, index) => `${index + 1}. ${url}`);
  return `Attached image URLs:\n${lines.join("\n")}`;
}

export function buildAttachedImageUrlContextFromImages(
  images: ValidatedImage[],
): string | null {
  return buildAttachedImageUrlContextFromUrls(
    images.map((image) => image.sourceUrl),
  );
}

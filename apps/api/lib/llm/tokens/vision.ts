import type { MessageContentPart } from "@edward/shared/llm/types";

const SMALL_IMAGE_BYTES = 512 * 512 * 3;
const MEDIUM_IMAGE_BYTES = 768 * 768 * 3;
const LARGE_IMAGE_BYTES = 1024 * 1024 * 3;
const XL_IMAGE_BYTES = 2048 * 2048 * 3;

function estimateImageTokens(base64Length: number): number {
  const estimatedBytes = Math.ceil(base64Length * 0.75);

  if (estimatedBytes <= SMALL_IMAGE_BYTES) {
    return 85;
  }
  if (estimatedBytes <= MEDIUM_IMAGE_BYTES) {
    return 170;
  }
  if (estimatedBytes <= LARGE_IMAGE_BYTES) {
    return 255;
  }
  if (estimatedBytes <= XL_IMAGE_BYTES) {
    return 425;
  }
  return 595;
}

export function estimateVisionTokens(content: MessageContentPart[] | string): number {
  if (typeof content === "string") {
    return 0;
  }

  let total = 0;
  for (const part of content) {
    if (part.type === "image") {
      total += estimateImageTokens(part.base64.length);
    }
  }
  return total;
}

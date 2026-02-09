import { sanitizePathComponent } from "./storage/key.utils.js";
import { config } from "../config.js";

const CLOUDFRONT_URL = config.aws.cloudfrontDistributionUrl?.replace(/\/$/, "");

export function buildPreviewUrl(userId: string, chatId: string): string | null {
  if (!CLOUDFRONT_URL) return null;

  const pathParts = [
    sanitizePathComponent(userId),
    sanitizePathComponent(chatId),
  ];

  return `${CLOUDFRONT_URL}/${pathParts.join("/")}/`;
}

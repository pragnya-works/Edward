import { sanitizePathComponent } from "./storage/key.utils.js";

const CLOUDFRONT_URL = process.env.CLOUDFRONT_DISTRIBUTION_URL?.replace(/\/$/, '');

export function buildPreviewUrl(userId: string, chatId: string): string | null {
    if (!CLOUDFRONT_URL) return null;

    const pathParts = [
        sanitizePathComponent(userId),
        sanitizePathComponent(chatId),
    ];

    return `${CLOUDFRONT_URL}/${pathParts.join('/')}/`;
}

import { sanitizePathComponent } from './storage.service.js';

const CLOUDFRONT_URL = process.env.CLOUDFRONT_DISTRIBUTION_URL?.replace(/\/$/, '');

export function isCloudFrontConfigured(): boolean {
    return Boolean(CLOUDFRONT_URL);
}

export function buildPreviewUrl(userId: string, chatId: string, entryFile = 'index.html'): string | null {
    if (!CLOUDFRONT_URL) return null;

    const path = [
        sanitizePathComponent(userId),
        sanitizePathComponent(chatId),
        entryFile.replace(/^\//, '')
    ].join('/');

    return `${CLOUDFRONT_URL}/${path}`;
}

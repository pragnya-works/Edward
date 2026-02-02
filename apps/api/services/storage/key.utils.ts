import { lookup } from 'mime-types';
import { MAX_KEY_LENGTH } from './config.js';
import { createS3UploadError } from './upload.js';

export function sanitizePathComponent(component: string): string {
  return component.replace(/[^a-zA-Z0-9-_.]/g, '_');
}

export function validateS3Key(key: string): void {
  if (!key || key.trim().length === 0) {
    throw createS3UploadError('S3 key cannot be empty', key, false);
  }

  if (key.length > MAX_KEY_LENGTH) {
    throw createS3UploadError(`S3 key exceeds maximum length of ${MAX_KEY_LENGTH} characters`, key, false);
  }

  if (key.includes('//') || key.startsWith('/')) {
    throw createS3UploadError('S3 key contains invalid path separators', key, false);
  }

  if (key.includes('..')) {
    throw createS3UploadError('S3 key contains path traversal sequences', key, false);
  }
}

export function getContentType(filePath: string): string {
  const lower = filePath.toLowerCase();

  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    return 'application/typescript';
  }

  if (lower.endsWith('.js') ||
      lower.endsWith('.jsx') ||
      lower.endsWith('.mjs') ||
      lower.endsWith('.cjs')) {
    return 'application/javascript';
  }

  if (lower.endsWith('.css')) {
    return 'text/css';
  }

  const contentType = lookup(filePath) || 'application/octet-stream';
  return contentType;
}

export function buildS3Key(userId: string, chatId: string, filePath?: string): string {
  const safeUserId = sanitizePathComponent(userId);
  const safeChatId = sanitizePathComponent(chatId);

  if (!safeUserId || !safeChatId) {
    throw new Error('Invalid S3 key components');
  }

  if (!filePath) {
    return `${safeUserId}/${safeChatId}/`;
  }

  const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  return `${safeUserId}/${safeChatId}/${normalizedPath}`;
}

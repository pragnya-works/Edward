import { describe, it, expect } from 'vitest';
import {
  ApiKeySchema,
  ApiKeyDataSchema,
  CreateApiKeyRequestSchema,
  UpdateApiKeyRequestSchema,
} from '../../schemas/apiKey.schema.js';

describe('apiKey schemas', () => {
  describe('ApiKeySchema', () => {
    it('should validate valid API key', () => {
      const result = ApiKeySchema.safeParse({
        apiKey: 'sk-proj-valid-api-key-1234567890123456789012345678901234567890',
      });

      expect(result.success).toBe(true);
    });

    it('should reject API key shorter than 20 characters', () => {
      const result = ApiKeySchema.safeParse({
        apiKey: 'short-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toBe('API key must be at least 20 characters');
      }
    });

    it('should reject API key longer than 500 characters', () => {
      const result = ApiKeySchema.safeParse({
        apiKey: 'a'.repeat(501),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toBe('API key cannot exceed 500 characters');
      }
    });

    it('should accept API key at exactly 20 characters', () => {
      const result = ApiKeySchema.safeParse({
        apiKey: 'a'.repeat(20),
      });

      expect(result.success).toBe(true);
    });

    it('should accept API key at exactly 500 characters', () => {
      const result = ApiKeySchema.safeParse({
        apiKey: 'a'.repeat(500),
      });

      expect(result.success).toBe(true);
    });

    it('should reject non-string API key', () => {
      const result = ApiKeySchema.safeParse({
        apiKey: 12345,
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing API key', () => {
      const result = ApiKeySchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe('ApiKeyDataSchema', () => {
    it('should validate complete API key data', () => {
      const result = ApiKeyDataSchema.safeParse({
        hasApiKey: true,
        userId: 'user-123',
        keyPreview: 'sk-proj...abcd',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(result.success).toBe(true);
    });

    it('should validate without optional fields', () => {
      const result = ApiKeyDataSchema.safeParse({
        hasApiKey: false,
        userId: 'user-123',
      });

      expect(result.success).toBe(true);
    });

    it('should reject missing required fields', () => {
      const result = ApiKeyDataSchema.safeParse({
        hasApiKey: true,
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid hasApiKey type', () => {
      const result = ApiKeyDataSchema.safeParse({
        hasApiKey: 'yes',
        userId: 'user-123',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('CreateApiKeyRequestSchema', () => {
    it('should validate valid create request', () => {
      const result = CreateApiKeyRequestSchema.safeParse({
        body: {
          apiKey: 'sk-proj-valid-api-key-123456789012345678901234567890',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid body', () => {
      const result = CreateApiKeyRequestSchema.safeParse({
        body: {
          apiKey: 'short',
        },
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing body', () => {
      const result = CreateApiKeyRequestSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe('UpdateApiKeyRequestSchema', () => {
    it('should validate valid update request', () => {
      const result = UpdateApiKeyRequestSchema.safeParse({
        body: {
          apiKey: 'sk-proj-new-api-key-123456789012345678901234567890123',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid API key in update', () => {
      const result = UpdateApiKeyRequestSchema.safeParse({
        body: {
          apiKey: '',
        },
      });

      expect(result.success).toBe(false);
    });
  });
});

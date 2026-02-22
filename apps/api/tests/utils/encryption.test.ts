import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { encrypt, decrypt } from '../../utils/encryption.js';

describe('encryption', () => {
  const originalEnv = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalEnv;
  });

  describe('encrypt', () => {
    it('should encrypt plaintext successfully', () => {
      const plaintext = 'my-secret-api-key';
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.length).toBeGreaterThan(plaintext.length);
    });

    it('should produce different ciphertexts for same plaintext', () => {
      const plaintext = 'my-secret-api-key';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle unicode characters', () => {
      const plaintext = '🔐 secret key with émojis and ñoño';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('decrypt', () => {
    it('should decrypt ciphertext back to original plaintext', () => {
      const plaintext = 'my-secret-api-key';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;\':",./<>?';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle multiline strings', () => {
      const plaintext = 'line1\nline2\nline3\n\nline5';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('encrypt/decrypt roundtrip', () => {
    it('should maintain data integrity for various inputs', () => {
      const testCases = [
        'sk-proj-test-api-key-12345',
        'AIzaSyB-test-gemini-key',
        'short',
        '',
        'key-with-dashes_and_underscores.123',
        'key with spaces',
        'key\twith\ttabs',
      ];

      testCases.forEach((input) => {
        const encrypted = encrypt(input);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(input);
      });
    });

  });
});

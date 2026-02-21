import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function parseHexKeyOrThrow(raw: string, label: string): Buffer {
  const normalized = raw.trim();
  if (normalized.length !== KEY_LENGTH * 2) {
    throw new Error(
      `${label} must be ${KEY_LENGTH * 2} hex characters, got ${normalized.length}`,
    );
  }

  if (!/^[0-9a-f]+$/i.test(normalized)) {
    throw new Error(`${label} must only contain hexadecimal characters`);
  }

  const parsed = Buffer.from(normalized, 'hex');
  if (parsed.length !== KEY_LENGTH) {
    throw new Error(`${label} must decode to exactly ${KEY_LENGTH} bytes`);
  }

  return parsed;
}

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (typeof key !== 'string') {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. '
    );
  }
  
  return parseHexKeyOrThrow(key, 'ENCRYPTION_KEY');
}

function decryptWithKey(encrypted: string, key: Buffer): string {
  const combined = Buffer.from(encrypted, 'base64');
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = combined.subarray(IV_LENGTH + 16);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return plaintext.toString('utf8');
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, ciphertext]);
  return combined.toString('base64');
}

export function decrypt(encrypted: string): string {
  const key = getEncryptionKey();
  return decryptWithKey(encrypted, key);
}
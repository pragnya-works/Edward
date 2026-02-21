import { decrypt, encrypt } from "./encryption.js";

const SECRET_ENVELOPE_PREFIX = "enc:v1:";

export function isSecretEnvelope(value: string): boolean {
  return value.startsWith(SECRET_ENVELOPE_PREFIX);
}

export function encryptSecret(value: string): string {
  return `${SECRET_ENVELOPE_PREFIX}${encrypt(value)}`;
}

export function decryptSecret(value: string): string {
  if (!isSecretEnvelope(value)) {
    return value;
  }

  return decrypt(value.slice(SECRET_ENVELOPE_PREFIX.length));
}

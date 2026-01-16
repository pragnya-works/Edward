const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const encryptApiKey = async (apiKey: string): Promise<string> => {
  const data = encoder.encode(apiKey);

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const passwordBuffer = encoder.encode("edward_app_encryption_key_placeholder");

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedData = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    aesKey,
    data
  );

  const combined = new Uint8Array(salt.byteLength + iv.byteLength + encryptedData.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.byteLength);
  combined.set(new Uint8Array(encryptedData), salt.byteLength + iv.byteLength);

  return btoa(String.fromCharCode(...combined));
};

export const decryptApiKey = async (encryptedApiKey: string): Promise<string> => {
  const binaryString = atob(encryptedApiKey);
  const combined = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    combined[i] = binaryString.charCodeAt(i);
  }

  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const encryptedData = combined.slice(28);

  const passwordBuffer = encoder.encode("edward_app_encryption_key_placeholder");

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['decrypt']
  );

  const decryptedData = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    aesKey,
    encryptedData
  );

  return decoder.decode(decryptedData);
};
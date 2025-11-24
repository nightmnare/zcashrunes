import type { TransparentAddressPayload } from './zcash';

const STORAGE_KEY = 'zcash_wallet_v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type StoredWalletRecord = {
  name: string;
  address: string;
  salt: string;
  iv: string;
  ciphertext: string;
};

const bufferToBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToBuffer = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const toArrayBuffer = (view: Uint8Array): ArrayBuffer => view.slice().buffer;

const deriveKey = async (password: string, salt: Uint8Array) => {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: 150_000,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptWalletRecord = async (
  payload: TransparentAddressPayload,
  password: string,
  name: string
): Promise<StoredWalletRecord> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = encoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
    },
    key,
    data
  );

  return {
    name,
    address: payload.address,
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext),
  };
};

export const decryptWalletRecord = async (
  password: string,
  record: StoredWalletRecord
): Promise<TransparentAddressPayload> => {
  const salt = base64ToBuffer(record.salt);
  const iv = base64ToBuffer(record.iv);
  const ciphertext = base64ToBuffer(record.ciphertext);
  const key = await deriveKey(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
    },
    key,
    toArrayBuffer(ciphertext)
  );

  const json = decoder.decode(decrypted);
  return JSON.parse(json) as TransparentAddressPayload;
};

export const saveWalletRecord = (record: StoredWalletRecord) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
};

export const loadWalletRecord = (): StoredWalletRecord | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredWalletRecord;
  } catch {
    return null;
  }
};

export const removeWalletRecord = () => {
  localStorage.removeItem(STORAGE_KEY);
};

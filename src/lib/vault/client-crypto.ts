'use client';

const DB_NAME = 'ez-share-vault';
const STORE_NAME = 'device-keys';
const DEVICE_KEY = 'primary';

export type DeviceIdentity = { deviceId: string; publicKey: CryptoKey; privateKey: CryptoKey; publicJwk: JsonWebKey };
export type EncryptedPayload = { ciphertext: string; iv: string };

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function openKeyDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  const db = await openKeyDb();
  const existing = await new Promise<{ deviceId: string; publicKey: CryptoKey; privateKey: CryptoKey } | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(DEVICE_KEY);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  if (existing?.privateKey.usages.includes('unwrapKey') && existing.publicKey.usages.includes('wrapKey')) return { ...existing, publicJwk: await crypto.subtle.exportKey('jwk', existing.publicKey) };
  const pair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['wrapKey', 'unwrapKey']);
  const identity = { deviceId: crypto.randomUUID(), publicKey: pair.publicKey, privateKey: pair.privateKey };
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(identity, DEVICE_KEY);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
  return { ...identity, publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey) };
}

export function generateWorkspaceKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportWorkspaceKey(key: CryptoKey) {
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

export function importWorkspaceKey(rawKey: string) {
  return crypto.subtle.importKey('raw', base64ToBytes(rawKey), { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapWorkspaceKey(key: CryptoKey, publicJwk: JsonWebKey) {
  if (!publicJwk.key_ops?.includes('wrapKey')) throw new Error('This device must refresh its Vault key before access can be granted.');
  const publicKey = await crypto.subtle.importKey('jwk', publicJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey']);
  const wrapped = await crypto.subtle.wrapKey('raw', key, publicKey, { name: 'RSA-OAEP' });
  return bytesToBase64(new Uint8Array(wrapped));
}

export async function unwrapWorkspaceKey(wrappedKey: string, privateKey: CryptoKey) {
  return crypto.subtle.unwrapKey('raw', base64ToBytes(wrappedKey), privateKey, { name: 'RSA-OAEP' }, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function encryptVaultPayload(key: CryptoKey, workspaceId: string, itemId: string, payload: unknown): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode(`ez-share:v1:${workspaceId}:${itemId}`);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData, tagLength: 128 }, key, plaintext);
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) };
}

export async function decryptVaultPayload<T>(key: CryptoKey, workspaceId: string, itemId: string, encrypted: EncryptedPayload): Promise<T> {
  const additionalData = new TextEncoder().encode(`ez-share:v1:${workspaceId}:${itemId}`);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(encrypted.iv), additionalData, tagLength: 128 }, key, base64ToBytes(encrypted.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export async function encryptOneTimeShare(payload: unknown) {
  const key = await generateWorkspaceKey();
  const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode('ez-share:one-time:v1');
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData, tagLength: 128 }, key, plaintext);
  const keyId = new Uint8Array(await crypto.subtle.digest('SHA-256', rawKey));
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv), key: bytesToBase64(rawKey), keyId: bytesToBase64(keyId) };
}

export async function decryptOneTimeShare<T>(keyValue: string, encrypted: EncryptedPayload): Promise<T> {
  const key = await importWorkspaceKey(keyValue);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(encrypted.iv), additionalData: new TextEncoder().encode('ez-share:one-time:v1'), tagLength: 128 }, key, base64ToBytes(encrypted.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export async function oneTimeShareKeyId(keyValue: string) {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', base64ToBytes(keyValue))));
}

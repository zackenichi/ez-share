import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function masterKey() {
  const configuredKey = process.env.VAULT_MASTER_KEY;
  if (process.env.NODE_ENV === 'production' && !configuredKey) {
    throw new Error('VAULT_MASTER_KEY must be configured in production.');
  }
  const secret = configuredKey || process.env.FIREBASE_PRIVATE_KEY;
  if (!secret) throw new Error('VAULT_MASTER_KEY is not configured.');
  return createHash('sha256').update(`ez-share:vault-master:v1:${secret}`).digest();
}

export function protectWorkspaceKey(rawKey: string) {
  const keyBytes = Buffer.from(rawKey, 'base64');
  if (keyBytes.length !== 32) throw new Error('INVALID_WORKSPACE_KEY');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(keyBytes), cipher.final()]);
  return { ciphertext: Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64'), iv: iv.toString('base64') };
}

export function revealWorkspaceKey(ciphertext: string, iv: string) {
  const payload = Buffer.from(ciphertext, 'base64');
  const encrypted = payload.subarray(0, -16);
  const tag = payload.subarray(-16);
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('base64');
}

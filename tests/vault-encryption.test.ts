import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptOneTimeShare, decryptVaultPayload, encryptOneTimeShare, encryptVaultPayload, generateWorkspaceKey, oneTimeShareKeyId, unwrapWorkspaceKey, wrapWorkspaceKey } from '../src/lib/vault/client-crypto.ts';

test('encrypts a Vault payload and binds it to its workspace and item', async () => {
  const key = await generateWorkspaceKey();
  const payload = { kind: 'password', title: 'Example', password: 'not-in-firestore' };
  const encrypted = await encryptVaultPayload(key, 'workspace-a', 'item-a', payload);
  assert.equal(encrypted.ciphertext.includes(payload.password), false);
  assert.deepEqual(await decryptVaultPayload(key, 'workspace-a', 'item-a', encrypted), payload);
  await assert.rejects(() => decryptVaultPayload(key, 'workspace-b', 'item-a', encrypted));
});

test('wraps one workspace key for a device without exporting its private key', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['wrapKey', 'unwrapKey']);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const original = await generateWorkspaceKey();
  const wrapped = await wrapWorkspaceKey(original, publicJwk);
  const restored = await unwrapWorkspaceKey(wrapped, pair.privateKey);
  const encrypted = await encryptVaultPayload(original, 'workspace-a', 'item-a', { ok: true });
  assert.deepEqual(await decryptVaultPayload(restored, 'workspace-a', 'item-a', encrypted), { ok: true });
  assert.equal(pair.privateKey.extractable, false);
});

test('encrypts a one-time share with a separate key and rejects the wrong key', async () => {
  const payload = { kind: 'note', title: 'Private', note: 'one-time content' };
  const encrypted = await encryptOneTimeShare(payload);
  assert.equal(encrypted.ciphertext.includes(payload.note), false);
  assert.equal(await oneTimeShareKeyId(encrypted.key), encrypted.keyId);
  assert.deepEqual(await decryptOneTimeShare(encrypted.key, encrypted), payload);
  const other = await encryptOneTimeShare({ different: true });
  await assert.rejects(() => decryptOneTimeShare(other.key, encrypted));
});

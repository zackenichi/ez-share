import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const newSecret = process.env.VAULT_MASTER_KEY;

if (!projectId || !clientEmail || !privateKey || !newSecret) {
  throw new Error('FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and VAULT_MASTER_KEY are required.');
}

function derive(secret) {
  return createHash('sha256').update(`ez-share:vault-master:v1:${secret}`).digest();
}

function decrypt(ciphertext, iv, key) {
  const payload = Buffer.from(ciphertext, 'base64');
  if (payload.length <= 16) throw new Error('Invalid protected workspace key.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(payload.subarray(-16));
  const rawKey = Buffer.concat([decipher.update(payload.subarray(0, -16)), decipher.final()]);
  if (rawKey.length !== 32) throw new Error('Invalid decrypted workspace key.');
  return rawKey;
}

function encrypt(rawKey, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(rawKey), cipher.final()]);
  return {
    ciphertext: Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);
const legacyKey = derive(process.env.FIREBASE_PRIVATE_KEY);
const currentKey = derive(newSecret);

async function main() {
  const snapshot = await db.collection('teams').get();
  const summary = { inspected: snapshot.size, protected: 0, alreadyCurrent: 0, migratable: 0, migrated: 0, failed: 0 };

  for (const document of snapshot.docs) {
    const data = document.data();
    if (!data.vaultKeyCiphertext || !data.vaultKeyIv) continue;
    summary.protected += 1;

    try {
      decrypt(data.vaultKeyCiphertext, data.vaultKeyIv, currentKey);
      summary.alreadyCurrent += 1;
      continue;
    } catch {
      // Expected for envelopes protected by the legacy Firebase-key fallback.
    }

    let rawKey;
    try {
      rawKey = decrypt(data.vaultKeyCiphertext, data.vaultKeyIv, legacyKey);
      summary.migratable += 1;
    } catch {
      summary.failed += 1;
      console.error(`Unable to decrypt workspace ${document.id} with the current or legacy protecting key.`);
      continue;
    }

    if (!apply) continue;
    const protectedKey = encrypt(rawKey, currentKey);
    await db.runTransaction(async transaction => {
      const latest = await transaction.get(document.ref);
      const latestData = latest.data();
      if (!latestData || latestData.vaultKeyCiphertext !== data.vaultKeyCiphertext || latestData.vaultKeyIv !== data.vaultKeyIv) {
        throw new Error(`Workspace ${document.id} changed during migration; rerun the migration.`);
      }
      transaction.update(document.ref, {
        vaultKeyCiphertext: protectedKey.ciphertext,
        vaultKeyIv: protectedKey.iv,
        vaultKeyProtection: 'vault-master',
        vaultKeyProtectionVersion: 1,
        vaultKeyMigratedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    summary.migrated += 1;
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...summary }, null, 2));
  if (summary.failed > 0) process.exitCode = 2;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

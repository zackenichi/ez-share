import { randomBytes } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');

let contents;
try {
  contents = await readFile(envPath, 'utf8');
} catch {
  throw new Error('Create .env.local first with: cp env.example .env.local');
}

const existing = contents.match(/^VAULT_MASTER_KEY=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
if (existing) {
  throw new Error('VAULT_MASTER_KEY is already set. Refusing to overwrite an encryption key.');
}

const assignment = `VAULT_MASTER_KEY="${randomBytes(32).toString('base64')}"`;
const next = /^VAULT_MASTER_KEY=.*$/m.test(contents)
  ? contents.replace(/^VAULT_MASTER_KEY=.*$/m, assignment)
  : `${contents.trimEnd()}\n\n# Server-only key used to protect encrypted workspace keys.\n${assignment}\n`;

await writeFile(envPath, next, { encoding: 'utf8', mode: 0o600 });
await chmod(envPath, 0o600);
console.log('Generated VAULT_MASTER_KEY in .env.local. Back up this value securely before storing Vault data.');

# Encryption and key management

This document describes Ez-Share's current Vault encryption model, what `VAULT_MASTER_KEY` protects, its security boundaries, and the operational plan for backups and rotation.

## Short answer: what is `VAULT_MASTER_KEY`?

Every workspace receives a random 256-bit AES workspace key. Browsers use that workspace key to encrypt and decrypt the workspace's passwords, secure notes, and folder names.

The workspace key must be recoverable for every authorized member, so Ez-Share stores a protected copy in Firestore. `VAULT_MASTER_KEY` is the server-only key-encryption secret used to encrypt that workspace key before storage.

It is not:

- a user password;
- stored in Firestore;
- sent to the browser;
- used directly to encrypt every password or note; or
- interchangeable with the Firebase Web API key.

The hierarchy is:

```text
VAULT_MASTER_KEY (deployment secret)
  └─ encrypts each workspace AES key
       └─ encrypts that workspace's folders, passwords, and notes
```

This envelope-encryption design lets the application use a unique data-encryption key per workspace while keeping those keys encrypted at rest in the database.

## Encryption flow

### Creating or updating a Vault item

1. The server verifies the Firebase session and active workspace membership.
2. The authorized browser receives the workspace key over the authenticated HTTPS connection.
3. The browser serializes the item and encrypts it with AES-256-GCM using Web Crypto.
4. The workspace ID and item ID are authenticated as additional data, preventing ciphertext from being moved to another workspace or item without detection.
5. Firestore receives ciphertext, an initialization vector, key version, timestamps, item type, and opaque folder authorization metadata. It does not receive the password, note body, or folder name as plaintext.

AES-GCM provides confidentiality and integrity. A fresh random 96-bit IV is generated for each encryption operation.

### Opening a Vault

1. The server validates the session and membership.
2. The server decrypts the workspace key using `VAULT_MASTER_KEY`.
3. The workspace key is returned only to the authorized browser over HTTPS.
4. The browser decrypts Vault items locally.

This means a database-only compromise does not reveal Vault plaintext. The application server remains trusted because it can release workspace keys after authorization.

### One-time shares

A one-time share does not reuse the workspace key. The browser:

1. generates a separate random AES-256 key;
2. encrypts a copy of the selected item;
3. sends only the encrypted copy and a key fingerprint to the server;
4. places the decryption key in the URL fragment, which browsers do not send in HTTP requests; and
5. gives the server a hashed bearer token rather than storing the plaintext token.

The reveal endpoint consumes the share atomically before returning its ciphertext. Shares expire after 24 hours. Link previews cannot consume or decrypt them because they do not receive the URL fragment.

## What the design protects

- Firestore records and database backups do not contain Vault item plaintext.
- Someone with database-only access cannot decrypt workspace keys without `VAULT_MASTER_KEY`.
- Tampering with ciphertext, workspace IDs, or item IDs causes AES-GCM authentication to fail.
- Folder and workspace permissions are validated on the server before reads and writes.
- One-time shares use independent keys, hashed tokens, explicit expiration, and single-use consumption.

## What the design does not protect

- A compromised application server or deployment that can read `VAULT_MASTER_KEY`.
- A compromised authenticated browser after Vault content has been decrypted.
- An authorized member copying content while they have access.
- Plaintext copied to the clipboard, screenshots, browser extensions, malware, or endpoint monitoring.
- Immediate cryptographic revocation of content a removed member already retained.

Ez-Share currently provides application-managed encryption, not zero-knowledge end-to-end encryption. That distinction should remain explicit in product and security claims.

## Creating and storing the master key

For a new environment, generate and write a 32-byte key without printing it:

```bash
npm run vault:generate-key
```

Store the output as the server-only `VAULT_MASTER_KEY` environment variable. Recommended storage is a managed secrets service provided by the hosting platform or cloud provider, with access limited to the production application runtime.

Operational rules:

- Never use a memorable password.
- Never prefix it with `NEXT_PUBLIC_`.
- Never commit it, log it, email it, or store it in Firestore.
- Keep one stable value per environment and make it available to every application instance.
- Keep an independently protected backup. Loss of the key means loss of all workspace keys protected by it.
- Do not rotate it by simply replacing the environment variable.

## Existing data and migration

Early development versions used `FIREBASE_PRIVATE_KEY` as a local fallback when `VAULT_MASTER_KEY` was absent. Workspace key ciphertext created under that fallback cannot be decrypted by an unrelated new master key.

Before setting a new master key against an existing database:

1. Back up Firestore and the current Firebase service-account secret.
2. Inventory workspaces containing `vaultKeyCiphertext`.
3. Run a controlled migration capable of decrypting each workspace key with the legacy secret and immediately re-encrypting it with the new `VAULT_MASTER_KEY`.
4. Record a key-encryption version on every migrated workspace.
5. Verify authorized users can decrypt representative Vault items.
6. Only then remove the legacy secret from the migration path and rotate the Firebase service account if required.

The repository includes an idempotent migration utility. Preview it first, then apply it:

```bash
npm run vault:migrate-master-key
npm run vault:migrate-master-key -- --apply
```

The utility verifies whether each protected workspace key is already readable with the new key, migrates only legacy envelopes, and uses a transaction to avoid overwriting a concurrently changed envelope. Do not remove the legacy Firebase credential or deploy the new master key until the applied migration reports zero failures.

## Rotation plan

Safe master-key rotation should use versioned keys:

1. Add `VAULT_MASTER_KEY_CURRENT`, its version identifier, and a temporarily retained previous key.
2. Make decryption select the key by the workspace's key-encryption version.
3. Rewrap workspace keys in a transaction or idempotent migration without decrypting every Vault item.
4. Verify every workspace is on the new version.
5. Remove the old key only after backups encrypted under it have passed their retention period or remain intentionally recoverable.

Workspace-key rotation is different. It is required for stronger cryptographic revocation after a member is removed: generate a new workspace key, decrypt and re-encrypt every item, update authorized key access, then retire the old workspace key.

## Deployment checklist

- `VAULT_MASTER_KEY` is set and backed up.
- The Firebase client and Admin project IDs match.
- Firebase emulators are disabled.
- Firestore client rules deny all reads and writes; application access goes through authorized server routes.
- HTTPS is enforced by the hosting platform.
- Production and staging use different master keys and databases.
- Logs and error monitoring do not capture Vault plaintext, workspace keys, share fragments, session cookies, or service-account credentials.
- Restore procedures include both Firestore data and the corresponding master-key version.

## Planned security work

1. Build and test the legacy-to-versioned master-key migration utility.
2. Add versioned master-key rotation with a documented rollback procedure.
3. Add workspace-key rotation after membership removal.
4. Expand authorization, invitation, concurrent acceptance, share-consumption, and encryption migration tests.
5. Add audit events for permission changes, item sharing, membership removal, and key rotation without recording secret content.
6. Review whether a future zero-knowledge model is required; it would require a different recovery and team-key-sharing design.

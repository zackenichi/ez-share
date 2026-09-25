import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';
import { ADMIN_TEAM_ID } from '@/lib/teams/admin-workspace';
import { protectWorkspaceKey, revealWorkspaceKey } from '@/lib/vault/server-crypto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEVICE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const ITEM_ID = /^[A-Za-z0-9_-]{1,80}$/;
const folderMetadata = { itemKind: z.enum(['folder', 'password', 'note']), folderId: z.string().regex(ITEM_ID) };
const publicKeySchema = z.object({ kty: z.literal('RSA'), n: z.string().min(100).max(1000), e: z.string().min(1).max(20), alg: z.string().optional(), key_ops: z.array(z.string()).optional(), ext: z.boolean().optional() }).passthrough();
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('registerDevice'), deviceId: z.string().regex(DEVICE_ID), publicKeyJwk: publicKeySchema }),
  z.object({ action: z.literal('resetEmptyVault') }),
  z.object({ action: z.literal('requestAccess'), deviceId: z.string().regex(DEVICE_ID) }),
  z.object({ action: z.literal('escrowWorkspaceKey'), deviceId: z.string().regex(DEVICE_ID), workspaceKey: z.string().min(40).max(60) }),
  z.object({ action: z.literal('putEnvelope'), senderDeviceId: z.string().regex(DEVICE_ID), deviceId: z.string().regex(DEVICE_ID), recipientUid: z.string().min(1).max(128), wrappedKey: z.string().min(100).max(2000), initialize: z.boolean().optional() }),
  z.object({ action: z.literal('createItem'), itemId: z.string().regex(ITEM_ID), ciphertext: z.string().min(20).max(500_000), iv: z.string().min(16).max(64), keyVersion: z.literal(1), ...folderMetadata }),
  z.object({ action: z.literal('updateItem'), itemId: z.string().regex(ITEM_ID), ciphertext: z.string().min(20).max(500_000), iv: z.string().min(16).max(64), keyVersion: z.literal(1), ...folderMetadata }),
  z.object({ action: z.literal('deleteItem'), itemId: z.string().regex(ITEM_ID) }),
  z.object({ action: z.literal('migrateMetadata'), items: z.array(z.object({ itemId: z.string().regex(ITEM_ID), ...folderMetadata })).max(200) }),
]);

async function contextFor(uid: string, teamId: string) {
  if (teamId === ADMIN_TEAM_ID) return null;
  const membership = await getAdminDb().collection('users').doc(uid).collection('teamMemberships').doc(teamId).get();
  const data = membership.data();
  if (data?.status !== 'active') return null;
  const role = data.role === 'owner' ? 'owner' as const : 'member' as const;
  return { role, canEdit: role === 'owner' || data.canEdit === true, canDelete: role === 'owner' || data.canDelete === true, canShare: role === 'owner' || data.canShare === true, canManageAccess: role === 'owner' || data.canManageAccess === true };
}

export async function GET(request: NextRequest, route: RouteContext<'/api/teams/[id]/vault'>) {
  const session = await getSessionUser(true); if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await route.params; const access = await contextFor(session.uid, id);
  if (!access) return NextResponse.json({ error: 'Workspace access is required.' }, { status: 403 });
  const deviceId = request.nextUrl.searchParams.get('deviceId') || '';
  if (!DEVICE_ID.test(deviceId)) return NextResponse.json({ error: 'A valid device is required.' }, { status: 400 });
  const db = getAdminDb(); const teamRef = db.collection('teams').doc(id);
  const [team, envelope, items, folderPermissions] = await Promise.all([
    teamRef.get(),
    teamRef.collection('vaultKeyEnvelopes').doc(`${session.uid}_${deviceId}`).get(),
    teamRef.collection('vaultItems').orderBy('createdAt', 'desc').limit(200).get(),
    access.role === 'owner' ? Promise.resolve(null) : teamRef.collection('folderPermissions').limit(200).get(),
  ]);
  if (!team.exists || team.data()?.status === 'archived') return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  let recipients: Array<{ uid: string; deviceId: string; publicKeyJwk: JsonWebKey; hasEnvelope: boolean }> = [];
  if (request.nextUrl.searchParams.get('recipients') === '1' && access.canShare && envelope.exists) {
    const membershipSnapshot = await db.collectionGroup('teamMemberships').where('teamId', '==', id).limit(50).get();
    const memberships = membershipSnapshot.docs.filter(document => document.data().status === 'active');
    const deviceSnapshots = await Promise.all(memberships.map(document => db.collection('users').doc(document.data().userId).collection('vaultDevices').where('status', '==', 'active').limit(10).get()));
    const envelopeIds = new Set((await teamRef.collection('vaultKeyEnvelopes').limit(500).get()).docs.map(document => document.id));
    recipients = deviceSnapshots.flatMap((snapshot, index) => snapshot.docs
      .filter(device => Array.isArray(device.data().publicKeyJwk?.key_ops) && device.data().publicKeyJwk.key_ops.includes('wrapKey'))
      .map(device => ({ uid: memberships[index].data().userId as string, deviceId: device.id, publicKeyJwk: device.data().publicKeyJwk as JsonWebKey, hasEnvelope: envelopeIds.has(`${memberships[index].data().userId}_${device.id}`) })));
  }
  const teamData = team.data();
  let workspaceKey: string | null = null;
  if (teamData?.vaultKeyCiphertext && teamData?.vaultKeyIv) workspaceKey = revealWorkspaceKey(teamData.vaultKeyCiphertext, teamData.vaultKeyIv);
  const permissionDocuments = folderPermissions?.docs ?? [];
  const permissionByFolder = new Map(permissionDocuments.map(document => [document.id, document.data().members?.[session.uid] as { canView?: boolean } | undefined]));
  const folderAccess = Object.fromEntries(permissionDocuments.map(document => { const saved = document.data().members?.[session.uid]; return [document.id, { canView: saved?.canView !== false, canEdit: access.canEdit && saved?.canView !== false && saved?.canEdit !== false, canDelete: access.canDelete && saved?.canView !== false && saved?.canDelete !== false, canShare: access.canShare && saved?.canView !== false && saved?.canShare !== false }]; }));
  const visibleItems = items.docs.filter(document => {
    if (access.role === 'owner') return true;
    const data = document.data(); const folderId = data.itemKind === 'folder' ? document.id : data.folderId;
    return typeof folderId !== 'string' || folderId === 'none' || permissionByFolder.get(folderId)?.canView !== false;
  });
  return NextResponse.json(
    { access, folderAccess, revision: teamData?.vaultRevision || 0, keyInitialized: teamData?.vaultKeyVersion === 1, workspaceKey, envelope: envelope.exists ? envelope.data()?.wrappedKey ?? null : null, items: visibleItems.map(document => ({ id: document.id, ciphertext: document.data().ciphertext, iv: document.data().iv, keyVersion: document.data().keyVersion, createdAt: document.data().createdAt?.toMillis?.() ?? document.data().updatedAt?.toMillis?.() ?? 0, updatedAt: document.data().updatedAt?.toMillis?.() ?? 0 })), recipients },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
  );
}

export async function POST(request: NextRequest, route: RouteContext<'/api/teams/[id]/vault'>) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const session = await getSessionUser(true); if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await route.params; const access = await contextFor(session.uid, id);
  if (!access) return NextResponse.json({ error: 'Workspace access is required.' }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid encrypted Vault request.' }, { status: 400 });
  const db = getAdminDb(); const teamRef = db.collection('teams').doc(id); const body = parsed.data;
  if (body.action === 'registerDevice') {
    await db.collection('users').doc(session.uid).collection('vaultDevices').doc(body.deviceId).set({ publicKeyJwk: body.publicKeyJwk, algorithm: 'RSA-OAEP-256', capability: 'wrapKey', status: 'active', updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true });
  }
  if (body.action === 'resetEmptyVault') {
    if (access.role !== 'owner') return NextResponse.json({ error: 'Only the workspace owner can recover an empty Vault.' }, { status: 403 });
    try {
      await db.runTransaction(async transaction => {
        const [items, envelopes] = await Promise.all([transaction.get(teamRef.collection('vaultItems').limit(1)), transaction.get(teamRef.collection('vaultKeyEnvelopes').limit(500))]);
        if (!items.empty) throw new Error('NOT_EMPTY');
        envelopes.docs.forEach(document => transaction.delete(document.ref));
        transaction.update(teamRef, { vaultKeyVersion: FieldValue.delete(), vaultInitializedAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_EMPTY') return NextResponse.json({ error: 'A non-empty Vault cannot be reset.' }, { status: 409 });
      return NextResponse.json({ error: 'Unable to recover the empty Vault.' }, { status: 500 });
    }
  }
  if (body.action === 'requestAccess') {
    const device = await db.collection('users').doc(session.uid).collection('vaultDevices').doc(body.deviceId).get();
    if (device.data()?.status !== 'active') return NextResponse.json({ error: 'This device is not registered.' }, { status: 409 });
    const existingEnvelope = await teamRef.collection('vaultKeyEnvelopes').doc(`${session.uid}_${body.deviceId}`).get();
    if (existingEnvelope.exists) return NextResponse.json({ error: 'This device already has Vault access.' }, { status: 409 });
    const membershipSnapshot = await db.collectionGroup('teamMemberships').where('teamId', '==', id).limit(50).get();
    const approverUids = membershipSnapshot.docs.filter(document => document.data().status === 'active' && (document.data().role === 'owner' || document.data().canShare === true)).map(document => document.data().userId as string).filter(uid => uid !== session.uid);
    if (approverUids.length === 0) return NextResponse.json({ error: 'No authorized approver is available.' }, { status: 409 });
    const team = await teamRef.get(); const requestId = createHash('sha256').update(`${id}:${session.uid}:${body.deviceId}`).digest('hex');
    await db.collection('vaultAccessRequests').doc(requestId).set({ teamId: id, teamName: team.data()?.name || 'Workspace', requesterUid: session.uid, requesterName: session.name || session.email || 'A member', requesterEmail: session.email || '', deviceId: body.deviceId, approverUids, status: 'pending', expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  if (body.action === 'escrowWorkspaceKey') {
    if (!access.canShare) return NextResponse.json({ error: 'Share permission is required.' }, { status: 403 });
    const [device, envelope] = await Promise.all([
      db.collection('users').doc(session.uid).collection('vaultDevices').doc(body.deviceId).get(),
      teamRef.collection('vaultKeyEnvelopes').doc(`${session.uid}_${body.deviceId}`).get(),
    ]);
    if (device.data()?.status !== 'active' || !envelope.exists) return NextResponse.json({ error: 'This device does not have the existing workspace key.' }, { status: 403 });
    const protectedKey = protectWorkspaceKey(body.workspaceKey);
    try {
      await db.runTransaction(async transaction => {
        const team = await transaction.get(teamRef);
        if (team.data()?.vaultKeyCiphertext) throw new Error('ALREADY_ESCROWED');
        transaction.update(teamRef, { vaultKeyCiphertext: protectedKey.ciphertext, vaultKeyIv: protectedKey.iv, vaultKeyStorageVersion: 1, updatedAt: FieldValue.serverTimestamp() });
      });
      return NextResponse.json({ ok: true }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message === 'ALREADY_ESCROWED') return NextResponse.json({ error: 'The workspace key is already available.' }, { status: 409 });
      return NextResponse.json({ error: 'Unable to make the workspace key available.' }, { status: 500 });
    }
  }
  if (body.action === 'migrateMetadata') {
    if (access.role !== 'owner') return NextResponse.json({ error: 'Only the workspace owner can migrate folder metadata.' }, { status: 403 });
    const batch = db.batch();
    body.items.forEach(item => batch.set(teamRef.collection('vaultItems').doc(item.itemId), { itemKind: item.itemKind, folderId: item.itemKind === 'folder' ? item.itemId : item.folderId }, { merge: true }));
    await batch.commit();
    return NextResponse.json({ ok: true });
  }
  if (body.action === 'deleteItem') {
    if (!access.canDelete) return NextResponse.json({ error: 'Delete permission is required.' }, { status: 403 });
    const itemRef = teamRef.collection('vaultItems').doc(body.itemId);
    const item = await itemRef.get();
    if (!item.exists) return NextResponse.json({ error: 'Vault item not found.' }, { status: 404 });
    const folderId = item.data()?.folderId;
    if (access.role !== 'owner' && typeof folderId === 'string' && folderId !== 'none') {
      const settings = (await teamRef.collection('folderPermissions').doc(folderId).get()).data()?.members?.[session.uid];
      if (settings?.canView === false || settings?.canDelete === false) return NextResponse.json({ error: 'Delete permission is required for this folder.' }, { status: 403 });
    }
    const batch = db.batch();
    batch.delete(itemRef);
    batch.update(teamRef, { vaultRevision: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return NextResponse.json({ ok: true });
  }
  if (body.action === 'createItem' || body.action === 'updateItem') {
    if (!access.canEdit) return NextResponse.json({ error: 'Edit permission is required.' }, { status: 403 });
    const targetFolderId = body.itemKind === 'folder' ? body.itemId : body.folderId;
    if (access.role !== 'owner' && targetFolderId !== 'none') {
      const settings = (await teamRef.collection('folderPermissions').doc(targetFolderId).get()).data()?.members?.[session.uid];
      if (settings?.canView === false || settings?.canEdit === false) return NextResponse.json({ error: 'Edit permission is required for this folder.' }, { status: 403 });
    }
    const itemRef = teamRef.collection('vaultItems').doc(body.itemId);
    if (body.action === 'createItem') {
      const batch = db.batch();
      batch.create(itemRef, { ciphertext: body.ciphertext, iv: body.iv, cryptoVersion: 1, keyVersion: body.keyVersion, itemKind: body.itemKind, folderId: targetFolderId, createdByUid: session.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      batch.update(teamRef, { vaultRevision: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
      await batch.commit();
      return NextResponse.json({ ok: true }, { status: 201 });
    }
    try {
      if (access.role !== 'owner') {
        const existing = await itemRef.get(); const sourceFolderId = existing.data()?.folderId;
        if (!existing.exists) return NextResponse.json({ error: 'Vault item not found.' }, { status: 404 });
        if (typeof sourceFolderId === 'string' && sourceFolderId !== 'none') {
          const sourceSettings = (await teamRef.collection('folderPermissions').doc(sourceFolderId).get()).data()?.members?.[session.uid];
          if (sourceSettings?.canView === false || sourceSettings?.canEdit === false) return NextResponse.json({ error: 'Edit permission is required for this folder.' }, { status: 403 });
        }
      }
      const batch = db.batch();
      batch.update(itemRef, { ciphertext: body.ciphertext, iv: body.iv, cryptoVersion: 1, keyVersion: body.keyVersion, itemKind: body.itemKind, folderId: targetFolderId, updatedByUid: session.uid, updatedAt: FieldValue.serverTimestamp() });
      batch.update(teamRef, { vaultRevision: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
      await batch.commit();
      return NextResponse.json({ ok: true });
    } catch { return NextResponse.json({ error: 'Vault item not found.' }, { status: 404 }); }
  }
  if (!access.canShare) return NextResponse.json({ error: 'Share permission is required.' }, { status: 403 });
  const recipientUid = body.initialize ? session.uid : body.recipientUid;
  const recipientMembership = await db.collection('users').doc(recipientUid).collection('teamMemberships').doc(id).get();
  const recipientDevice = await db.collection('users').doc(recipientUid).collection('vaultDevices').doc(body.deviceId).get();
  if (recipientMembership.data()?.status !== 'active' || recipientDevice.data()?.status !== 'active') return NextResponse.json({ error: 'The recipient device is not authorized.' }, { status: 403 });
  try {
    await db.runTransaction(async transaction => {
      const [team, actorEnvelope] = await Promise.all([transaction.get(teamRef), transaction.get(teamRef.collection('vaultKeyEnvelopes').doc(`${session.uid}_${body.senderDeviceId}`))]);
      const initialized = team.data()?.vaultKeyVersion === 1;
      if (!initialized && (!body.initialize || access.role !== 'owner' || recipientUid !== session.uid)) throw new Error('INITIALIZATION_FORBIDDEN');
      if (initialized && !actorEnvelope.exists) {
        const actorEnvelopes = await transaction.get(teamRef.collection('vaultKeyEnvelopes').where('recipientUid', '==', session.uid).limit(1));
        if (actorEnvelopes.empty) throw new Error('KEY_REQUIRED');
      }
      transaction.set(teamRef.collection('vaultKeyEnvelopes').doc(`${recipientUid}_${body.deviceId}`), { recipientUid, deviceId: body.deviceId, wrappedKey: body.wrappedKey, algorithm: 'RSA-OAEP-256', keyVersion: 1, createdByUid: session.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (!initialized) transaction.update(teamRef, { vaultKeyVersion: 1, vaultInitializedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: code === 'KEY_REQUIRED' ? 'This device is waiting for Vault access.' : 'The Vault key cannot be initialized.' }, { status: 409 });
  }
}

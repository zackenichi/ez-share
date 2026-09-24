import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';
import { ADMIN_TEAM_ID } from '@/lib/teams/admin-workspace';

const schema = z.object({ itemId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), ciphertext: z.string().min(20).max(500_000), iv: z.string().min(16).max(64), keyId: z.string().min(40).max(60) });

export async function POST(request: NextRequest, route: RouteContext<'/api/teams/[id]/vault/shares'>) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const session = await getSessionUser(true); if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await route.params;
  if (id === ADMIN_TEAM_ID) return NextResponse.json({ error: 'Workspace access is required.' }, { status: 403 });
  const membership = await getAdminDb().collection('users').doc(session.uid).collection('teamMemberships').doc(id).get();
  const access = membership.data();
  if (access?.status !== 'active' || (access.role !== 'owner' && access.canShare !== true)) return NextResponse.json({ error: 'Share permission is required.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid encrypted share.' }, { status: 400 });
  const teamRef = getAdminDb().collection('teams').doc(id);
  const item = await teamRef.collection('vaultItems').doc(parsed.data.itemId).get();
  if (!item.exists) return NextResponse.json({ error: 'Vault item not found.' }, { status: 404 });
  const folderId = item.data()?.folderId;
  if (access.role !== 'owner' && typeof folderId === 'string' && folderId !== 'none') {
    const settings = (await teamRef.collection('folderPermissions').doc(folderId).get()).data()?.members?.[session.uid];
    if (settings?.canView === false || settings?.canShare === false) return NextResponse.json({ error: 'Share permission is required for this folder.' }, { status: 403 });
  }
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
  await getAdminDb().collection('vaultShares').doc(tokenHash).create({ ciphertext: parsed.data.ciphertext, iv: parsed.data.iv, keyId: parsed.data.keyId, teamId: id, sourceItemId: parsed.data.itemId, createdByUid: session.uid, status: 'pending', expiresAt, createdAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ token, expiresAt: expiresAt.toDate().toISOString() }, { status: 201 });
}

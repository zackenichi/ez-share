import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';

async function managerContext(teamId: string) {
  const session = await getSessionUser(true); if (!session) return null;
  const membership = await getAdminDb().collection('users').doc(session.uid).collection('teamMemberships').doc(teamId).get();
  const data = membership.data();
  return data?.status === 'active' && (data.role === 'owner' || data.canManageAccess === true) ? session : null;
}

export async function GET(_request: NextRequest, route: RouteContext<'/api/teams/[id]/folders/[folderId]/permissions'>) {
  const { id, folderId } = await route.params; const owner = await managerContext(id);
  if (!owner) return NextResponse.json({ error: 'Folder access permission is required.' }, { status: 403 });
  const db = getAdminDb(); const folder = await db.collection('teams').doc(id).collection('vaultItems').doc(folderId).get();
  if (!folder.exists) return NextResponse.json({ error: 'Folder not found.' }, { status: 404 });
  const [memberships, settings] = await Promise.all([
    db.collectionGroup('teamMemberships').where('teamId', '==', id).where('status', '==', 'active').limit(200).get(),
    db.collection('teams').doc(id).collection('folderPermissions').doc(folderId).get(),
  ]);
  const memberDocs = memberships.docs.filter(document => document.data().role !== 'owner');
  const profiles = memberDocs.length ? await db.getAll(...memberDocs.map(document => db.collection('users').doc(document.data().userId))) : [];
  const profilesById = new Map(profiles.map(profile => [profile.id, profile.data()]));
  const overrides = settings.data()?.members || {};
  const members = memberDocs.map(document => { const membership = document.data(); const uid = membership.userId as string; const profile = profilesById.get(uid); const saved = overrides[uid]; return { uid, name: profile?.displayName || profile?.email?.split('@')[0] || 'Member', email: profile?.email || '', workspaceCanEdit: membership.canEdit === true, workspaceCanDelete: membership.canDelete === true, workspaceCanShare: membership.canShare === true, canView: saved?.canView !== false, canEdit: membership.canEdit === true && saved?.canEdit !== false && saved?.canView !== false, canDelete: membership.canDelete === true && saved?.canDelete !== false && saved?.canView !== false, canShare: membership.canShare === true && saved?.canShare !== false && saved?.canView !== false }; });
  return NextResponse.json({ members });
}

export async function PATCH(request: NextRequest, route: RouteContext<'/api/teams/[id]/folders/[folderId]/permissions'>) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const { id, folderId } = await route.params; const owner = await managerContext(id);
  if (!owner) return NextResponse.json({ error: 'Folder access permission is required.' }, { status: 403 });
  const parsed = z.object({ members: z.array(z.object({ uid: z.string().min(1).max(128), canView: z.boolean(), canEdit: z.boolean(), canDelete: z.boolean(), canShare: z.boolean() })).max(200) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Valid folder permissions are required.' }, { status: 400 });
  const db = getAdminDb(); const teamRef = db.collection('teams').doc(id); const permissionRef = teamRef.collection('folderPermissions').doc(folderId);
  const [folder, previousPermissions] = await Promise.all([teamRef.collection('vaultItems').doc(folderId).get(), permissionRef.get()]);
  if (!folder.exists) return NextResponse.json({ error: 'Folder not found.' }, { status: 404 });
  const refs = parsed.data.members.map(member => db.collection('users').doc(member.uid).collection('teamMemberships').doc(id));
  const memberships = refs.length ? await db.getAll(...refs) : [];
  const byUid = new Map(memberships.map(document => [document.ref.parent.parent!.id, document.data()]));
  const members: Record<string, { canView: boolean; canEdit: boolean; canDelete: boolean; canShare: boolean }> = {};
  for (const requested of parsed.data.members) {
    const membership = byUid.get(requested.uid);
    if (membership?.status !== 'active' || membership.role === 'owner') continue;
    members[requested.uid] = { canView: requested.canView, canEdit: requested.canView && requested.canEdit && membership.canEdit === true, canDelete: requested.canView && requested.canDelete && membership.canDelete === true, canShare: requested.canView && requested.canShare && membership.canShare === true };
  }
  const previousMembers = previousPermissions.data()?.members ?? {};
  const batch = db.batch();
  batch.set(permissionRef, { members, updatedByUid: owner.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.update(teamRef, { vaultRevision: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  for (const [uid, permission] of Object.entries(members)) {
    const previous = previousMembers[uid];
    if (previous?.canView === permission.canView && previous?.canEdit === permission.canEdit && previous?.canDelete === permission.canDelete && previous?.canShare === permission.canShare) continue;
    batch.create(db.collection('users').doc(uid).collection('notifications').doc(), {
      type: 'access_changed',
      message: `Your folder access changed: ${permission.canView ? 'view' : 'no access'} · ${permission.canEdit ? 'edit' : 'cannot edit'} · ${permission.canDelete ? 'delete' : 'cannot delete'} · ${permission.canShare ? 'share' : 'cannot share'}.`,
      href: `/workspace/${id}/vault`,
      teamId: id,
      folderId,
      unread: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return NextResponse.json({ ok: true });
}

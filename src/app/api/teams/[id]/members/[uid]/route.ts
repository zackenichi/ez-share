import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';

async function authorize(request: NextRequest, teamId: string) {
  if (!isSameOrigin(request)) return null;
  const session = await getSessionUser(true);
  if (!session) return null;
  const membership = await getAdminDb().collection('users').doc(session.uid).collection('teamMemberships').doc(teamId).get();
  return membership.data()?.status === 'active' && membership.data()?.role === 'owner' ? session : null;
}

export async function PATCH(request: NextRequest, context: RouteContext<'/api/teams/[id]/members/[uid]'>) {
  const { id, uid } = await context.params;
  const actor = await authorize(request, id);
  if (!actor) return NextResponse.json({ error: 'Member management permission is required.' }, { status: 403 });
  const parsed = z.object({ canEdit: z.boolean(), canDelete: z.boolean(), canShare: z.boolean(), canInvite: z.boolean(), canManageAccess: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Valid permissions are required.' }, { status: 400 });
  const db = getAdminDb();
  const userRef = db.collection('users').doc(uid);
  const ref = userRef.collection('teamMemberships').doc(id);
  const membership = await ref.get();
  if (membership.data()?.status !== 'active') return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  if (membership.data()?.role === 'owner') return NextResponse.json({ error: 'The workspace owner cannot be edited.' }, { status: 403 });
  const previous = membership.data()!;
  if (previous.canEdit !== parsed.data.canEdit || previous.canDelete !== parsed.data.canDelete || previous.canShare !== parsed.data.canShare || previous.canInvite !== parsed.data.canInvite || previous.canManageAccess !== parsed.data.canManageAccess) {
    const batch = db.batch();
    batch.update(ref, { ...parsed.data, updatedAt: FieldValue.serverTimestamp() });
    batch.create(userRef.collection('notifications').doc(), {
      type: 'access_changed',
      message: `Your workspace access changed: ${parsed.data.canEdit ? 'edit' : 'view only'} · ${parsed.data.canDelete ? 'delete' : 'cannot delete'} · ${parsed.data.canShare ? 'share' : 'cannot share'} · ${parsed.data.canInvite ? 'invite' : 'cannot invite'} · ${parsed.data.canManageAccess ? 'manage folder access' : 'cannot manage access'}.`,
      href: `/workspace/${id}/vault`,
      teamId: id,
      unread: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }
  return NextResponse.json(parsed.data);
}

export async function DELETE(request: NextRequest, context: RouteContext<'/api/teams/[id]/members/[uid]'>) {
  const { id, uid } = await context.params;
  const actor = await authorize(request, id);
  if (!actor) return NextResponse.json({ error: 'Member management permission is required.' }, { status: 403 });
  const db = getAdminDb();
  const userRef = db.collection('users').doc(uid);
  const membershipRef = userRef.collection('teamMemberships').doc(id);
  try {
    await db.runTransaction(async transaction => {
      const [user, membership, memberships] = await Promise.all([
        transaction.get(userRef),
        transaction.get(membershipRef),
        transaction.get(userRef.collection('teamMemberships').where('status', '==', 'active')),
      ]);
      if (membership.data()?.status !== 'active') throw new Error('NOT_FOUND');
      if (membership.data()?.role === 'owner') throw new Error('OWNER');
      const fallback = memberships.docs.find(document => document.id !== id);
      transaction.update(membershipRef, { status: 'inactive', updatedAt: FieldValue.serverTimestamp() });
      const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (user.data()?.activeTeamId === id && fallback) updates.activeTeamId = fallback.id;
      if (user.data()?.defaultTeamId === id && fallback) updates.defaultTeamId = fallback.id;
      transaction.update(userRef, updates);
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'NOT_FOUND') return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
    if (code === 'OWNER') return NextResponse.json({ error: 'The workspace owner cannot be removed.' }, { status: 403 });
    return NextResponse.json({ error: 'Unable to remove the member.' }, { status: 500 });
  }
}

import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';
import { createInvitationToken, hashInvitationToken, newExpiration } from '@/lib/teams/workspace-invitations';

async function authorize(request: NextRequest, teamId: string) {
  if (!isSameOrigin(request)) return false;
  const session = await getSessionUser(true);
  if (!session) return false;
  const membership = await getAdminDb().collection('users').doc(session.uid).collection('teamMemberships').doc(teamId).get();
  return membership.data()?.status === 'active' && (membership.data()?.role === 'owner' || membership.data()?.canShare === true);
}

async function invitationForTeam(teamId: string, invitationId: string) {
  const ref = getAdminDb().collection('workspaceInvitations').doc(invitationId);
  const invitation = await ref.get();
  return invitation.exists && invitation.data()?.teamId === teamId ? { ref, invitation } : null;
}

export async function POST(request: NextRequest, context: RouteContext<'/api/teams/[id]/invitations/[invitationId]'>) {
  const { id, invitationId } = await context.params;
  if (!await authorize(request, id)) return NextResponse.json({ error: 'Sharing permission is required.' }, { status: 403 });
  const db = getAdminDb(); const ref = db.collection('workspaceInvitations').doc(invitationId); const token = createInvitationToken();
  try {
    await db.runTransaction(async transaction => { const invitation = await transaction.get(ref); if (!invitation.exists || invitation.data()?.teamId !== id || invitation.data()?.status !== 'pending') throw new Error('NOT_FOUND'); transaction.update(ref, { tokenHash: hashInvitationToken(token), expiresAt: newExpiration(), updatedAt: FieldValue.serverTimestamp() }); });
    return NextResponse.json({ shareUrl: new URL(`/workspace-invite/${token}`, request.nextUrl.origin).toString() });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') return NextResponse.json({ error: 'Pending invitation not found.' }, { status: 404 });
    return NextResponse.json({ error: 'Unable to copy the invitation.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext<'/api/teams/[id]/invitations/[invitationId]'>) {
  const { id, invitationId } = await context.params;
  if (!await authorize(request, id)) return NextResponse.json({ error: 'Member management permission is required.' }, { status: 403 });
  const parsed = z.object({ canEdit: z.boolean(), canShare: z.boolean(), canManageAccess: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Valid permissions are required.' }, { status: 400 });
  const result = await invitationForTeam(id, invitationId);
  if (!result || result.invitation.data()?.status !== 'pending') return NextResponse.json({ error: 'Pending invitation not found.' }, { status: 404 });
  await result.ref.update({ ...parsed.data, updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json(parsed.data);
}

export async function DELETE(request: NextRequest, context: RouteContext<'/api/teams/[id]/invitations/[invitationId]'>) {
  const { id, invitationId } = await context.params;
  if (!await authorize(request, id)) return NextResponse.json({ error: 'Member management permission is required.' }, { status: 403 });
  const result = await invitationForTeam(id, invitationId);
  if (!result || result.invitation.data()?.status !== 'pending') return NextResponse.json({ error: 'Pending invitation not found.' }, { status: 404 });
  await result.ref.update({ status: 'revoked', tokenHash: null, revokedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ success: true });
}

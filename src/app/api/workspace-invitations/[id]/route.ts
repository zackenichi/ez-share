import { timingSafeEqual } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';
import { hashInvitationToken, normalizeEmail } from '@/lib/teams/workspace-invitations';
import { workspaceLandingHref } from '@/lib/teams/routes';

export async function PATCH(request: NextRequest, context: RouteContext<'/api/workspace-invitations/[id]'>) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const session = await getSessionUser(true); if (!session?.email || !session.email_verified) return NextResponse.json({ error: 'A verified account is required.' }, { status: 401 });
  const { id } = await context.params; const body = await request.json().catch(() => null) as { action?: string; token?: string } | null;
  if (body?.action !== 'accept' && body?.action !== 'decline') return NextResponse.json({ error: 'A valid action is required.' }, { status: 400 });
  const db = getAdminDb(); const ref = db.collection('workspaceInvitations').doc(id);
  try { const teamId = await db.runTransaction(async (transaction) => { const invite = await transaction.get(ref); if (!invite.exists) throw new Error('NOT_FOUND'); const data = invite.data()!; if (data.status !== 'pending') throw new Error('NOT_PENDING'); if (data.expiresAt.toMillis() <= Date.now()) throw new Error('EXPIRED'); if (data.email !== normalizeEmail(session.email!)) throw new Error('WRONG_USER'); const expected = Buffer.from(data.tokenHash, 'hex'); const actual = Buffer.from(hashInvitationToken(body.token || ''), 'hex'); const accountBound = data.recipientUid === session.uid; if (!accountBound && (expected.length !== actual.length || !timingSafeEqual(expected, actual))) throw new Error('WRONG_USER'); if (body.action === 'decline') { transaction.update(ref, { status: 'declined', tokenHash: null, updatedAt: FieldValue.serverTimestamp() }); return data.teamId; } const team = await transaction.get(db.collection('teams').doc(data.teamId)); if (!team.exists || team.data()?.status === 'archived') throw new Error('NOT_FOUND'); transaction.set(db.collection('users').doc(session.uid).collection('teamMemberships').doc(data.teamId), { teamId: data.teamId, userId: session.uid, role: 'member', status: 'active', canEdit: data.canEdit === true, canDelete: data.canDelete === true, canShare: data.canShare === true, canInvite: data.canInvite === true, canManageAccess: data.canManageAccess === true, createdAt: FieldValue.serverTimestamp(), lastAccessedAt: FieldValue.serverTimestamp() }, { merge: true }); transaction.update(ref, { status: 'accepted', recipientUid: session.uid, tokenHash: null, acceptedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); return data.teamId; }); return NextResponse.json({ href: body.action === 'accept' ? workspaceLandingHref(teamId) : '/dashboard' }); }
  catch (error) { const code = error instanceof Error ? error.message : ''; const status = code === 'NOT_FOUND' ? 404 : code === 'EXPIRED' ? 410 : code === 'NOT_PENDING' ? 409 : 403; return NextResponse.json({ error: code === 'EXPIRED' ? 'This invitation expired.' : code === 'WRONG_USER' ? 'This invitation does not belong to your account.' : 'This invitation is unavailable.' }, { status }); }
}

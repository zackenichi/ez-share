import { timingSafeEqual } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';

import { hashInvitationToken, normalizeEmail } from '@/lib/auth/invitations';
import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';
import { setAdminWorkspaceAccess } from '@/lib/teams/admin-workspace';

function tokenMatches(storedHash: unknown, token: unknown) {
  if (typeof storedHash !== 'string' || typeof token !== 'string') return false;
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashInvitationToken(token), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function PATCH(request: NextRequest, context: RouteContext<'/api/invitations/[id]'>) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const session = await getSessionUser(true);
  if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { action?: unknown; token?: unknown } | null;
  if (body?.action !== 'accept' && body?.action !== 'decline') {
    return NextResponse.json({ error: 'A valid invitation action is required.' }, { status: 400 });
  }
  if (!session.email || !session.email_verified) {
    return NextResponse.json({ error: 'Verify your email address before responding to this invitation.' }, { status: 403 });
  }

  const invitationRef = getAdminDb().collection('adminInvitations').doc(id);
  const userRef = getAdminDb().collection('users').doc(session.uid);
  try {
    await getAdminDb().runTransaction(async (transaction) => {
      const invitation = await transaction.get(invitationRef);
      if (!invitation.exists) throw new Error('NOT_FOUND');
      const data = invitation.data()!;
      if (data.status !== 'pending') throw new Error('NOT_PENDING');
      if (data.expiresAt.toMillis() <= Date.now()) throw new Error('EXPIRED');
      if (data.email !== normalizeEmail(session.email!)) throw new Error('WRONG_RECIPIENT');
      if (data.role !== 'admin' && data.role !== 'user') throw new Error('INVALID_ROLE');

      const isAccountBound = data.recipientUid === session.uid;
      if (!isAccountBound && !tokenMatches(data.tokenHash, body.token)) throw new Error('TOKEN_MISMATCH');

      if (body.action === 'decline') {
        transaction.update(invitationRef, { status: 'declined', declinedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), tokenHash: null });
        return;
      }

      transaction.set(userRef, { role: data.role, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      setAdminWorkspaceAccess(transaction, session.uid, data.role === 'admin');
      transaction.update(invitationRef, { status: 'accepted', recipientUid: session.uid, acceptedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), tokenHash: null });
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'NOT_FOUND') return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
    if (code === 'EXPIRED') return NextResponse.json({ error: 'This invitation has expired.' }, { status: 410 });
    if (code === 'NOT_PENDING') return NextResponse.json({ error: 'This invitation is no longer pending.' }, { status: 409 });
    if (code === 'WRONG_RECIPIENT' || code === 'TOKEN_MISMATCH') return NextResponse.json({ error: 'This invitation does not belong to your account.' }, { status: 403 });
    if (code === 'INVALID_ROLE') return NextResponse.json({ error: 'This invitation has an invalid user type.' }, { status: 409 });
    throw error;
  }

  return NextResponse.json({ ok: true });
}

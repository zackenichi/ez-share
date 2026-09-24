import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';

import { createInvitationToken, hashInvitationToken, newExpiration } from '@/lib/auth/invitations';
import { getAdminSession } from '@/lib/auth/admin';
import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';

export async function PATCH(request: NextRequest, context: RouteContext<'/api/admin/invitations/[id]'>) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  if (body?.action !== 'revoke' && body?.action !== 'regenerate') {
    return NextResponse.json({ error: 'A valid invitation action is required.' }, { status: 400 });
  }

  const ref = getAdminDb().collection('adminInvitations').doc(id);
  const token = body.action === 'regenerate' ? createInvitationToken() : null;
  let email = '';
  try {
    await getAdminDb().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error('NOT_FOUND');
      const data = snapshot.data()!;
      if (data.status !== 'pending') throw new Error('NOT_PENDING');
      email = data.email;
      transaction.update(ref, body.action === 'revoke' ? {
        status: 'revoked', revokedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), tokenHash: null,
      } : {
        tokenHash: hashInvitationToken(token!), expiresAt: newExpiration(), updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
    if (error instanceof Error && error.message === 'NOT_PENDING') return NextResponse.json({ error: 'Only pending invitations can be changed.' }, { status: 409 });
    throw error;
  }

  const shareUrl = token ? new URL(`/invite/${token}`, request.nextUrl.origin).toString() : null;
  return NextResponse.json({ ok: true, email, shareUrl });
}

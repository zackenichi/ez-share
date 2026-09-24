import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { getAdminSession } from '@/lib/auth/admin';
import { createInvitationToken, findAuthUserByEmail, hashInvitationToken, invitationIdForEmail, listAdminInvitations, newExpiration, normalizeEmail } from '@/lib/auth/invitations';
import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';

const invitationSchema = z.object({
  email: z.email().transform(normalizeEmail),
  role: z.enum(['admin', 'user']),
});

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 });
  return NextResponse.json({ invitations: await listAdminInvitations() });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 });

  const parsed = invitationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'A valid email address and user type are required.' }, { status: 400 });
  if (normalizeEmail(admin.email ?? '') === parsed.data.email) {
    return NextResponse.json({ error: 'You cannot invite yourself.' }, { status: 400 });
  }

  const existingUser = await findAuthUserByEmail(parsed.data.email);
  if (existingUser) {
    const profile = await getAdminDb().collection('users').doc(existingUser.uid).get();
    if (profile.data()?.role === 'admin') {
      return NextResponse.json({ error: 'This person already has an administrator account.' }, { status: 409 });
    }
  }

  const token = createInvitationToken();
  const invitationRef = getAdminDb().collection('adminInvitations').doc(invitationIdForEmail(parsed.data.email));
  try {
    await getAdminDb().runTransaction(async (transaction) => {
      const current = await transaction.get(invitationRef);
      if (current.data()?.status === 'pending' && current.data()!.expiresAt.toMillis() > Date.now()) {
        throw new Error('DUPLICATE_INVITATION');
      }
      transaction.set(invitationRef, {
        email: parsed.data.email,
        role: parsed.data.role,
        status: 'pending',
        tokenHash: hashInvitationToken(token),
        recipientUid: existingUser?.uid ?? null,
        invitedByUid: admin.uid,
        invitedByName: admin.name || admin.email || 'An administrator',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: newExpiration(),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DUPLICATE_INVITATION') {
      return NextResponse.json({ error: 'A pending invitation already exists for this email address.' }, { status: 409 });
    }
    throw error;
  }

  const shareUrl = existingUser ? null : new URL(`/invite/${token}`, request.nextUrl.origin).toString();
  return NextResponse.json({ ok: true, shareUrl }, { status: 201 });
}

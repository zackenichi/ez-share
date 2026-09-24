import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;

  try { return new URL(origin).host === host; } catch { return false; }
}

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });

  const user = await getSessionUser(true);
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const body = await request.json() as { displayName?: unknown };
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    if (!displayName || displayName.length > 100) {
      return NextResponse.json({ error: 'Display name must be between 1 and 100 characters.' }, { status: 400 });
    }

    await getAdminAuth().updateUser(user.uid, { displayName });
    await getAdminDb().collection('users').doc(user.uid).set({ displayName, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ displayName });
  } catch (error) {
    console.error('Unable to update profile:', error);
    return NextResponse.json({ error: 'Unable to update your profile.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });

  const user = await getSessionUser(true);
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    await getAdminDb().collection('users').doc(user.uid).delete();
    await getAdminAuth().deleteUser(user.uid);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, '', { httpOnly: true, expires: new Date(0), path: '/', sameSite: 'lax' });
    return response;
  } catch (error) {
    console.error('Unable to delete account:', error);
    return NextResponse.json({ error: 'Unable to delete the account.' }, { status: 500 });
  }
}

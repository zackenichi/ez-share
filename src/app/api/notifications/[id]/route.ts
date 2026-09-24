import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';

import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';

const NOTIFICATION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function PATCH(request: NextRequest, route: RouteContext<'/api/notifications/[id]'>) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const session = await getSessionUser(true);
  if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await route.params;
  if (!NOTIFICATION_ID.test(id)) return NextResponse.json({ error: 'Notification not found.' }, { status: 404 });

  await getAdminDb().collection('users').doc(session.uid).collection('notifications').doc(id)
    .set({ unread: false, readAt: FieldValue.serverTimestamp() }, { merge: true });
  return NextResponse.json({ ok: true });
}

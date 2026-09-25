import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';

type AccessNotification = {
  id: string;
  message: string;
  href: string;
  createdAt: string | null;
};

export async function GET() {
  const session = await getSessionUser(true);
  if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });

  const snapshot = await getAdminDb()
    .collection('users').doc(session.uid)
    .collection('notifications').where('unread', '==', true).limit(10).get();

  const notifications: AccessNotification[] = snapshot.docs
    .map(document => ({
      id: document.id,
      message: typeof document.data().message === 'string' ? document.data().message : 'Your access changed.',
      href: typeof document.data().href === 'string' ? document.data().href : '/dashboard',
      createdAt: document.data().createdAt?.toDate?.().toISOString() ?? null,
    }))
    .sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? ''));

  return NextResponse.json({ notifications }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const session = await getSessionUser(true);
  if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const parsed = z.object({ ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)).min(1).max(50) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Valid notification IDs are required.' }, { status: 400 });

  const db = getAdminDb();
  const batch = db.batch();
  for (const id of [...new Set(parsed.data.ids)]) {
    batch.set(db.collection('users').doc(session.uid).collection('notifications').doc(id), { unread: false, readAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();
  return NextResponse.json({ ok: true });
}

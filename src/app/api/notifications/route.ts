import { NextResponse } from 'next/server';

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

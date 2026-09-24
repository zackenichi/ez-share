import 'server-only';

import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';

export async function getAdminSession() {
  const session = await getSessionUser(true);
  if (!session) return null;
  const profile = await getAdminDb().collection('users').doc(session.uid).get();
  return profile.data()?.role === 'admin' ? session : null;
}

import 'server-only';

import { cookies } from 'next/headers';

import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { getAdminAuth } from '@/lib/firebase/admin';

export async function getSessionUser(checkRevoked = false) {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    return await getAdminAuth().verifySessionCookie(sessionCookie, checkRevoked);
  } catch {
    return null;
  }
}

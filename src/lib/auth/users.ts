import 'server-only';

import type { ManagedUser } from '@/components/admin/user-management';
import { isRootEmail } from '@/config/auth';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

export const USERS_PAGE_SIZE = 10;

export async function listManagedUsers(currentUid: string, pageToken?: string) {
  const result = await getAdminAuth().listUsers(USERS_PAGE_SIZE, pageToken);
  const refs = result.users.map((user) => getAdminDb().collection('users').doc(user.uid));
  const profiles = refs.length ? await getAdminDb().getAll(...refs) : [];
  const profileByUid = new Map(profiles.map((profile) => [profile.id, profile.data()]));

  const users: ManagedUser[] = result.users.map((user) => {
    const profile = profileByUid.get(user.uid);
    return {
      uid: user.uid,
      name: profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Unnamed user',
      email: user.email || 'No email',
      photoURL: profile?.photoURL || user.photoURL || null,
      role: profile?.role === 'admin' || isRootEmail(user.email) ? 'admin' : 'user',
      disabled: user.disabled,
      protected: isRootEmail(user.email),
      current: user.uid === currentUid,
      lastSignIn: user.metadata.lastSignInTime || null,
    };
  });

  return { users, nextPageToken: result.pageToken ?? null };
}

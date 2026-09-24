import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';

import { getAdminDb } from '@/lib/firebase/admin';

export const ADMIN_TEAM_ID = 'admin-workspace';
export const ADMIN_TEAM_NAME = 'Admin';

export function setAdminWorkspaceAccess(transaction: Transaction, uid: string, enabled: boolean) {
  const db = getAdminDb();
  const userRef = db.collection('users').doc(uid);
  const membershipRef = userRef.collection('teamMemberships').doc(ADMIN_TEAM_ID);

  if (enabled) {
    transaction.set(db.collection('teams').doc(ADMIN_TEAM_ID), {
      name: ADMIN_TEAM_NAME,
      status: 'active',
      system: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(membershipRef, {
      teamId: ADMIN_TEAM_ID,
      userId: uid,
      role: 'admin',
      status: 'active',
      lastAccessedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(userRef, { adminWorkspaceProvisioned: true }, { merge: true });
    return;
  }

  transaction.set(membershipRef, {
    teamId: ADMIN_TEAM_ID,
    userId: uid,
    role: 'member',
    status: 'inactive',
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  transaction.set(userRef, { adminWorkspaceProvisioned: false }, { merge: true });
}

export async function ensureAdminWorkspaceAccess(uid: string) {
  const db = getAdminDb();
  const userRef = db.collection('users').doc(uid);
  const membershipRef = userRef.collection('teamMemberships').doc(ADMIN_TEAM_ID);
  await db.runTransaction(async (transaction) => {
    const [user, membership] = await Promise.all([transaction.get(userRef), transaction.get(membershipRef)]);
    if (user.data()?.role !== 'admin') return;
    if (membership.data()?.status === 'active' && membership.data()?.role === 'admin') {
      transaction.set(userRef, { adminWorkspaceProvisioned: true }, { merge: true });
      return;
    }
    setAdminWorkspaceAccess(transaction, uid, true);
  });
}

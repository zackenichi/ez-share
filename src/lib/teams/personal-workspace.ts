import 'server-only';

import { FieldValue, type DocumentReference, type Transaction } from 'firebase-admin/firestore';

import { getAdminDb } from '@/lib/firebase/admin';

export const PERSONAL_WORKSPACE_NAME = 'My workspace';
const LEGACY_ADMIN_TEAM_ID = 'admin-workspace';

export function createPersonalWorkspaceWrites(transaction: Transaction, uid: string, userRef: DocumentReference, teamRef: DocumentReference) {
  transaction.create(teamRef, {
    name: PERSONAL_WORKSPACE_NAME,
    status: 'active',
    createdBy: uid,
    personalOwnerId: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  transaction.create(userRef.collection('teamMemberships').doc(teamRef.id), {
    teamId: teamRef.id,
    userId: uid,
    role: 'owner',
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
    lastAccessedAt: FieldValue.serverTimestamp(),
  });
}

export async function ensurePersonalWorkspace(uid: string) {
  const db = getAdminDb();
  const userRef = db.collection('users').doc(uid);
  const newTeamRef = db.collection('teams').doc();

  await db.runTransaction(async (transaction) => {
    const user = await transaction.get(userRef);
    if (!user.exists) return;
    const data = user.data()!;
    if (data.personalWorkspaceProvisioned === true) return;

    const activeTeamId = typeof data.activeTeamId === 'string' ? data.activeTeamId : null;
    const activeTeamRef = activeTeamId ? db.collection('teams').doc(activeTeamId) : null;
    const activeMembershipRef = activeTeamId ? userRef.collection('teamMemberships').doc(activeTeamId) : null;
    const [activeTeam, activeMembership] = activeTeamRef && activeMembershipRef
      ? await Promise.all([transaction.get(activeTeamRef), transaction.get(activeMembershipRef)])
      : [null, null];
    const activeTeamData = activeTeam?.data();
    const activeMembershipData = activeMembership?.data();
    const isLegacyPersonalWorkspace = Boolean(
      activeTeamId !== LEGACY_ADMIN_TEAM_ID
      && activeTeam?.exists
      && activeTeamData?.createdBy === uid
      && activeMembershipData?.role === 'owner'
      && activeMembershipData?.status === 'active'
      && typeof activeTeamData?.name === 'string'
      && activeTeamData.name.endsWith("'s workspace"),
    );

    let personalWorkspaceId: string;
    if (isLegacyPersonalWorkspace && activeTeamRef) {
      personalWorkspaceId = activeTeamRef.id;
      transaction.update(activeTeamRef, { name: PERSONAL_WORKSPACE_NAME, personalOwnerId: uid, updatedAt: FieldValue.serverTimestamp() });
    } else {
      personalWorkspaceId = newTeamRef.id;
      createPersonalWorkspaceWrites(transaction, uid, userRef, newTeamRef);
    }

    transaction.update(userRef, {
      personalWorkspaceId,
      personalWorkspaceProvisioned: true,
      ...(!activeTeamId || activeTeamId === LEGACY_ADMIN_TEAM_ID ? { activeTeamId: personalWorkspaceId } : {}),
      ...(typeof data.defaultTeamId !== 'string' ? { defaultTeamId: personalWorkspaceId } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

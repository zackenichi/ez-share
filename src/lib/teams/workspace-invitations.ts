import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { createInvitationToken, hashInvitationToken, newExpiration, normalizeEmail } from '@/lib/auth/invitations';
import { getAdminDb } from '@/lib/firebase/admin';

export type WorkspaceInvitation = { id: string; teamId: string; teamName: string; email: string; canEdit: boolean; canDelete: boolean; canShare: boolean; canInvite: boolean; canManageAccess: boolean; status: string; expiresAt: string; invitedByName: string };
export const workspaceInvitationId = (teamId: string, email: string) => createHash('sha256').update(`${teamId}:${normalizeEmail(email)}`).digest('hex');
export { createInvitationToken, hashInvitationToken, newExpiration, normalizeEmail };
export function serializeWorkspaceInvitation(id: string, data: DocumentData): WorkspaceInvitation {
  return { id, teamId: data.teamId, teamName: data.teamName || 'Workspace', email: data.email, canEdit: data.canEdit === true, canDelete: data.canDelete === true, canShare: data.canShare === true, canInvite: data.canInvite === true, canManageAccess: data.canManageAccess === true, status: data.status, expiresAt: data.expiresAt.toDate().toISOString(), invitedByName: data.invitedByName || 'A workspace owner' };
}
export async function getWorkspaceInvitationByToken(token: string) {
  const tokenHash = hashInvitationToken(token);
  const snapshot = await getAdminDb().collection('workspaceInvitations').where('tokenHash', '==', tokenHash).limit(1).get();
  const document = snapshot.docs[0]; if (!document) return null;
  const data = document.data(); const expected = Buffer.from(data.tokenHash, 'hex'); const actual = Buffer.from(tokenHash, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual) || data.status !== 'pending' || data.expiresAt.toMillis() <= Date.now()) return null;
  return serializeWorkspaceInvitation(document.id, data);
}

export async function claimPendingWorkspaceInvitations(uid: string, verifiedEmail: string) {
  const email = normalizeEmail(verifiedEmail);
  const db = getAdminDb();
  const snapshot = await db.collection('workspaceInvitations').where('email', '==', email).limit(25).get();
  await Promise.all(snapshot.docs.map(document => db.runTransaction(async transaction => {
    const invitation = await transaction.get(document.ref); const data = invitation.data();
    if (!data || data.email !== email || data.status !== 'pending' || data.expiresAt.toMillis() <= Date.now()) return;
    if (data.recipientUid && data.recipientUid !== uid) return;
    transaction.update(document.ref, { recipientUid: uid, claimedAt: data.claimedAt || FieldValue.serverTimestamp() });
  })));
}

export async function getPendingWorkspaceInvitations(uid: string) {
  const snapshot = await getAdminDb().collection('workspaceInvitations').where('recipientUid', '==', uid).limit(25).get();
  return snapshot.docs
    .filter(document => document.data().status === 'pending' && document.data().expiresAt.toMillis() > Date.now())
    .map(document => serializeWorkspaceInvitation(document.id, document.data()));
}

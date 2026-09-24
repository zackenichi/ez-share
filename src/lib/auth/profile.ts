import 'server-only';

import { cache } from 'react';

import { getPendingAdminInvitation } from '@/lib/auth/invitations';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';
import { ensureAdminWorkspaceAccess } from '@/lib/teams/admin-workspace';
import { ensurePersonalWorkspace } from '@/lib/teams/personal-workspace';
import { getTeamContext } from '@/lib/teams/teams';
import { getPendingWorkspaceInvitations } from '@/lib/teams/workspace-invitations';

export const getCurrentProfile = cache(async () => {
  const session = await getSessionUser(true);
  if (!session) return null;

  const profile = await getAdminDb().collection('users').doc(session.uid).get();
  const data = profile.data();
  const role = data?.role === 'admin' ? 'admin' as const : 'user' as const;

  const needsPersonalWorkspace = data?.personalWorkspaceProvisioned !== true;
  const needsAdminWorkspace = role === 'admin' && data?.adminWorkspaceProvisioned !== true;
  if (needsPersonalWorkspace) await ensurePersonalWorkspace(session.uid);
  if (needsAdminWorkspace) await ensureAdminWorkspaceAccess(session.uid);

  const [invitation, workspaceInvitations, teamContext] = await Promise.all([
    session.email_verified ? getPendingAdminInvitation(session.uid, session.email) : null,
    session.email_verified ? getPendingWorkspaceInvitations(session.uid) : [],
    getTeamContext(session.uid, needsPersonalWorkspace ? undefined : data?.activeTeamId, data?.defaultTeamId),
  ]);

  return {
    uid: session.uid,
    name: data?.displayName || session.name || session.email?.split('@')[0] || 'User',
    email: data?.email || session.email || '',
    photoURL: data?.photoURL || session.picture || null,
    role,
    invitation,
    workspaceInvitations,
    teamContext,
    defaultTeamId: typeof data?.defaultTeamId === 'string' ? data.defaultTeamId : null,
  };
});

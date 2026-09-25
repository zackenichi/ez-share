import 'server-only';

import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';

import { getAdminDb } from '@/lib/firebase/admin';
import { selectAuthorizedTeam, type TeamMembership } from '@/lib/teams/selection';

export type Team = {
  id: string;
  name: string;
  role: TeamMembership['role'];
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
  canInvite: boolean;
  canManageAccess: boolean;
};

export type TeamContext = {
  teams: Team[];
  currentTeam: Team | null;
  error: boolean;
};

function membershipFromData(teamId: string, data: DocumentData): TeamMembership | null {
  const role = data.role;
  if (data.teamId !== teamId) return null;
  if (role !== 'owner' && role !== 'admin' && role !== 'member') return null;
  return { teamId, role, status: data.status === 'active' ? 'active' : 'inactive', canEdit: role === 'owner' || data.canEdit === true, canDelete: role === 'owner' || data.canDelete === true, canShare: role === 'owner' || data.canShare === true, canInvite: role === 'owner' || data.canInvite === true, canManageAccess: role === 'owner' || data.canManageAccess === true };
}

function teamFromDocument(document: DocumentSnapshot, membership: TeamMembership): Team {
  return {
    id: document.id,
    name: typeof document.data()?.name === 'string' && document.data()!.name.trim()
      ? document.data()!.name.trim()
      : 'Untitled workspace',
    role: membership.role,
    canEdit: membership.canEdit,
    canDelete: membership.canDelete === true,
    canShare: membership.canShare,
    canInvite: membership.canInvite === true,
    canManageAccess: membership.canManageAccess === true,
  };
}

export async function getAuthorizedTeam(uid: string, teamId: string): Promise<Team | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(teamId)) return null;
  const db = getAdminDb();
  const [membership, team] = await Promise.all([
    db.collection('users').doc(uid).collection('teamMemberships').doc(teamId).get(),
    db.collection('teams').doc(teamId).get(),
  ]);
  const parsedMembership = membershipFromData(teamId, membership.data() ?? {});
  if (parsedMembership?.status !== 'active' || !team.exists || team.data()?.status === 'archived') return null;
  return teamFromDocument(team, parsedMembership);
}

export async function getTeamContext(uid: string, preferredTeamId?: unknown, defaultTeamId?: unknown): Promise<TeamContext> {
  try {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(uid);
    const user = preferredTeamId === undefined ? await userRef.get() : null;
    const storedTeamId = user?.data()?.activeTeamId;
    const activeTeamId = typeof preferredTeamId === 'string'
      ? preferredTeamId
      : typeof storedTeamId === 'string' ? storedTeamId : null;
    const recentSnapshot = await userRef.collection('teamMemberships').orderBy('lastAccessedAt', 'desc').limit(5).get();
    const recentIds = new Set(recentSnapshot.docs.map(document => document.id));
    const [activeMembership, defaultMembership] = await Promise.all([
      activeTeamId && !recentIds.has(activeTeamId) ? userRef.collection('teamMemberships').doc(activeTeamId).get() : Promise.resolve(null),
      typeof defaultTeamId === 'string' && !recentIds.has(defaultTeamId) ? userRef.collection('teamMemberships').doc(defaultTeamId).get() : Promise.resolve(null),
    ]);
    const membershipDocuments = new Map([
      ...recentSnapshot.docs,
      ...(activeMembership?.exists ? [activeMembership] : []),
      ...(defaultMembership?.exists ? [defaultMembership] : []),
    ].map((document) => [document.id, document]));
    const memberships = [...membershipDocuments.values()]
      .map((document) => {
        const data = document.data() ?? {};
        return {
          membership: membershipFromData(document.id, data),
          lastAccessedAt: data.lastAccessedAt?.toMillis?.() ?? 0,
        };
      })
      .filter((entry): entry is { membership: TeamMembership; lastAccessedAt: number } => entry.membership?.status === 'active')
      .sort((left, right) => {
        if (left.membership.teamId === activeTeamId) return -1;
        if (right.membership.teamId === activeTeamId) return 1;
        if (left.membership.teamId === defaultTeamId) return -1;
        if (right.membership.teamId === defaultTeamId) return 1;
        return right.lastAccessedAt - left.lastAccessedAt;
      })
      .slice(0, 5)
      .map((entry) => entry.membership);

    if (!memberships.length) return { teams: [], currentTeam: null, error: false };

    const teamDocuments = await db.getAll(...memberships.map((membership) => db.collection('teams').doc(membership.teamId)));
    const membershipByTeam = new Map(memberships.map((membership) => [membership.teamId, membership]));
    const teams = teamDocuments
      .filter((document) => document.exists && document.data()?.status !== 'archived')
      .map((document) => teamFromDocument(document, membershipByTeam.get(document.id)!));

    return {
      teams,
      currentTeam: selectAuthorizedTeam(teams, activeTeamId),
      error: false,
    };
  } catch (error) {
    console.error('Unable to load workspaces:', error);
    return { teams: [], currentTeam: null, error: true };
  }
}

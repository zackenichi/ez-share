export type TeamMembership = {
  teamId: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'inactive';
  canEdit: boolean;
  canShare: boolean;
  canManageAccess?: boolean;
};

export function selectAuthorizedTeam<T extends { id: string }>(teams: T[], preferredTeamId: unknown) {
  if (!teams.length) return null;
  return teams.find((team) => team.id === preferredTeamId) ?? teams[0];
}

export function isActiveMembershipForTeam(membership: Pick<TeamMembership, 'teamId' | 'status'> | null, teamId: string) {
  return membership?.status === 'active' && membership.teamId === teamId;
}

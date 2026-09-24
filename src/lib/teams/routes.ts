export function workspaceLandingHref(teamId: string) {
  return teamId === 'admin-workspace' ? '/dashboard/admin' : `/workspace/${teamId}/vault`;
}

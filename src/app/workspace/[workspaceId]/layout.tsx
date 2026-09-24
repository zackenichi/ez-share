import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AppShell } from '@/components/dashboard/app-shell';
import { getCurrentProfile } from '@/lib/auth/profile';
import { getAuthorizedTeam } from '@/lib/teams/teams';
import { workspaceLandingHref } from '@/lib/teams/routes';

export const metadata: Metadata = { title: 'Workspace' };

export default async function WorkspaceLayout({ children, params }: LayoutProps<'/workspace/[workspaceId]'>) {
  const user = await getCurrentProfile();
  if (!user) redirect('/');

  const { workspaceId } = await params;
  const recentWorkspace = user.teamContext.teams.find((team) => team.id === workspaceId) ?? null;
  const workspace = recentWorkspace ?? await getAuthorizedTeam(user.uid, workspaceId);
  if (!workspace) {
    const fallback = user.teamContext.currentTeam;
    redirect(fallback ? workspaceLandingHref(fallback.id) : '/dashboard');
  }

  const teams = [workspace, ...user.teamContext.teams.filter((team) => team.id !== workspace.id)].slice(0, 5);
  const workspaceUser = {
    ...user,
    teamContext: { ...user.teamContext, teams, currentTeam: workspace },
  };

  return <AppShell user={workspaceUser}>{children}</AppShell>;
}

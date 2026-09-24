import { redirect } from 'next/navigation';
import { WorkspaceSettings } from '@/components/dashboard/workspace-settings';
import { getCurrentProfile } from '@/lib/auth/profile';
import { getAuthorizedTeam } from '@/lib/teams/teams';

export default async function WorkspaceSettingsPage({ params }: PageProps<'/workspace/[workspaceId]/settings'>) {
  const user = await getCurrentProfile();
  if (!user) redirect('/');
  const { workspaceId } = await params;
  const workspace = user.teamContext.teams.find((team) => team.id === workspaceId) ?? await getAuthorizedTeam(user.uid, workspaceId);
  if (!workspace || workspace.role !== 'owner') redirect(`/workspace/${workspaceId}/vault`);
  return <WorkspaceSettings workspaceId={workspace.id} initialName={workspace.name} />;
}

import { redirect } from 'next/navigation';
import { VaultView } from '@/components/dashboard/vault-view';
import { getCurrentProfile } from '@/lib/auth/profile';
import { ADMIN_TEAM_ID } from '@/lib/teams/admin-workspace';

export default async function VaultPage({ params }: PageProps<'/workspace/[workspaceId]/vault'>) {
  const { workspaceId } = await params;
  if (workspaceId === ADMIN_TEAM_ID) redirect('/dashboard/admin');
  const user = await getCurrentProfile();
  if (!user) redirect('/');
  const workspace = user.teamContext.teams.find(team => team.id === workspaceId);
  if (!workspace) redirect('/dashboard');
  return <VaultView workspaceId={workspaceId} canEdit={workspace.canEdit} canDelete={workspace.canDelete} canShare={workspace.canShare} canManageAccess={workspace.canManageAccess} isOwner={workspace.role === 'owner'} />;
}

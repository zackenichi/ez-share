import type { ReactNode } from 'react';

import { AdminInvitationCard } from '@/components/admin/admin-invitation-card';
import { AppMark } from '@/components/app-mark';
import { AppHeader } from '@/components/dashboard/app-header';
import { SidebarNav } from '@/components/dashboard/sidebar-nav';
import { TeamSwitcher } from '@/components/dashboard/team-switcher';
import type { AdminInvitation } from '@/lib/auth/invitations';
import { ADMIN_TEAM_ID } from '@/lib/teams/admin-workspace';
import type { TeamContext } from '@/lib/teams/teams';
import type { WorkspaceInvitation } from '@/lib/teams/workspace-invitations';

export function AppShell({ children, user }: { children: ReactNode; user: { name: string; email: string; photoURL: string | null; role: 'admin' | 'user'; invitation: AdminInvitation | null; workspaceInvitations?: WorkspaceInvitation[]; teamContext: TeamContext } }) {
  const showUserManagement = user.role === 'admin' && user.teamContext.currentTeam?.id === ADMIN_TEAM_ID;
  const showWorkspaceSettings = user.teamContext.currentTeam?.role === 'owner';
  const showTeam = Boolean(user.teamContext.currentTeam && user.teamContext.currentTeam.id !== ADMIN_TEAM_ID);
  const showVault = showTeam;

  return (
    <div className="min-h-svh bg-muted/30 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b bg-background px-4 py-4 lg:fixed lg:inset-y-0 lg:w-65 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <AppMark />
        <div className="mt-5 lg:mt-8"><TeamSwitcher {...user.teamContext} /></div>
        <div className="mt-4 lg:mt-6"><SidebarNav currentWorkspaceId={user.teamContext.currentTeam?.id ?? null} showVault={showVault} showTeam={showTeam} showUserManagement={showUserManagement} showWorkspaceSettings={showWorkspaceSettings} /></div>
      </aside>
      <div className="min-w-0 lg:col-start-2">
        <AppHeader name={user.name} email={user.email} photoURL={user.photoURL} invitation={user.invitation} workspaceInvitations={user.workspaceInvitations ?? []} />
        <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
          {user.invitation && <AdminInvitationCard invitation={user.invitation} />}
          {children}
        </div>
      </div>
    </div>
  );
}

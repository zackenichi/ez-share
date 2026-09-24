import { AccountMenu } from '@/components/dashboard/account-menu';
import { NotificationCenter } from '@/components/dashboard/notification-center';
import type { AdminInvitation } from '@/lib/auth/invitations';
import type { WorkspaceInvitation } from '@/lib/teams/workspace-invitations';

export function AppHeader({ name, email, photoURL, invitation, workspaceInvitations }: { name: string; email: string; photoURL: string | null; invitation: AdminInvitation | null; workspaceInvitations: WorkspaceInvitation[] }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-end border-b bg-background/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex items-center gap-2">
        <NotificationCenter invitation={invitation} initialWorkspaceInvitations={workspaceInvitations} />
        <AccountMenu name={name} email={email} photoURL={photoURL} />
      </div>
    </header>
  );
}

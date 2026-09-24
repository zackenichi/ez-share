import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { UserManagement } from '@/components/admin/user-management';
import { InvitationManagement } from '@/components/admin/invitation-management';
import { Badge } from '@/components/ui/badge';
import { appConfig } from '@/config/app';
import { getAdminSession } from '@/lib/auth/admin';
import { listAdminInvitations } from '@/lib/auth/invitations';
import { listManagedUsers } from '@/lib/auth/users';

export const metadata: Metadata = {
  title: 'User management',
};

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) redirect('/dashboard');

  const [{ users, nextPageToken }, invitations] = await Promise.all([
    listManagedUsers(session.uid),
    listAdminInvitations(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">User management</h1><Badge>Admin</Badge></div>
      </div>
      <InvitationManagement initialInvitations={invitations} />
      <UserManagement initialUsers={users} initialNextPageToken={nextPageToken} appName={appConfig.name} />
    </div>
  );
}

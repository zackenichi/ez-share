import type { Metadata } from 'next';

import { DeleteAccountDialog } from '@/components/auth/delete-account-dialog';
import { DefaultWorkspaceSetting } from '@/components/auth/default-workspace-setting';
import { ProfileForm } from '@/components/auth/profile-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { appConfig } from '@/config/app';
import { getCurrentProfile } from '@/lib/auth/profile';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Settings',
};

export default async function SettingsPage() {
  const user = await getCurrentProfile();
  if (!user) redirect('/');

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1><p className="mt-1 text-sm text-muted-foreground">Manage your profile and account preferences.</p></div>

      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent><ProfileForm initialName={user.name} email={user.email} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Default workspace</CardTitle><CardDescription>Choose the workspace opened when you sign in.</CardDescription></CardHeader>
        <CardContent><DefaultWorkspaceSetting teams={user.teamContext.teams} initialTeamId={user.defaultTeamId ?? user.teamContext.currentTeam?.id ?? null} /></CardContent>
      </Card>

      <Card className="ring-destructive/20">
        <CardHeader><CardTitle className="text-destructive">Danger zone</CardTitle><CardDescription>Deleting an account permanently removes your {appConfig.name} login and user profile.</CardDescription></CardHeader>
        <CardContent>
          <DeleteAccountDialog appName={appConfig.name} />
        </CardContent>
      </Card>
    </div>
  );
}

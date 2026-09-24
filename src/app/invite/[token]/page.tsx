import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AdminInvitationCard } from '@/components/admin/admin-invitation-card';
import { AppMark } from '@/components/app-mark';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { claimPendingAdminInvitation, getPendingAdminInvitationByToken, normalizeEmail } from '@/lib/auth/invitations';
import { getSessionUser } from '@/lib/firebase/session';

export const metadata: Metadata = { title: 'Invitation' };

export default async function InvitationPage({ params }: PageProps<'/invite/[token]'>) {
  const { token } = await params;
  const invitation = await getPendingAdminInvitationByToken(token);
  if (!invitation) {
    return <InvitationMessage title="Invitation unavailable" description="This invitation is invalid, expired, or no longer pending." />;
  }

  const session = await getSessionUser(true);
  if (!session) redirect(`/?returnTo=${encodeURIComponent(`/invite/${token}`)}`);
  if (!session.email_verified) {
    return <InvitationMessage title="Verify your email" description="Your account email must be verified before you can accept an administrator invitation." />;
  }
  if (!session.email || normalizeEmail(session.email) !== invitation.email) {
    return <InvitationMessage title="Invitation email mismatch" description={`Sign in using ${invitation.email} to respond to this invitation.`} />;
  }

  await claimPendingAdminInvitation(session.uid, session.email);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center gap-8 px-6 py-12">
      <AppMark />
      <AdminInvitationCard invitation={invitation} token={token} />
    </main>
  );
}

function InvitationMessage({ title, description }: { title: string; description: string }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center gap-8 px-6 py-12">
      <AppMark />
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
        <CardContent><Button render={<Link href="/dashboard" />}>Go to dashboard</Button></CardContent>
      </Card>
    </main>
  );
}

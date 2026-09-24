'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useGlobalProgress } from '@/components/global-progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { AdminInvitation } from '@/lib/auth/invitations';

export function AdminInvitationCard({ invitation, token }: { invitation: AdminInvitation; token?: string }) {
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null);
  const router = useRouter();
  const progress = useGlobalProgress();

  async function respond(action: 'accept' | 'decline') {
    setPending(action); progress.start();
    try {
      const response = await fetch(`/api/invitations/${invitation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, token }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to respond to the invitation.');
      toast.success(action === 'accept' ? 'Invitation accepted.' : 'Invitation declined.');
      router.replace('/dashboard');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to respond to the invitation.');
    } finally {
      setPending(null); progress.done();
    }
  }

  return (
    <Card className="border-primary/25 bg-primary/5">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="size-5" /></div>
          <div>
            <p className="font-medium">You have been invited as {invitation.role === 'admin' ? 'an administrator' : 'a user'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{invitation.invitedByName} invited {invitation.email}. This invitation expires {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(invitation.expiresAt))}.</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" disabled={pending !== null} onClick={() => respond('decline')}>{pending === 'decline' ? 'Declining…' : 'Decline'}</Button>
          <Button disabled={pending !== null} onClick={() => respond('accept')}>{pending === 'accept' ? 'Accepting…' : 'Accept invitation'}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

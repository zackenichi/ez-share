'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link2, MailPlus, RotateCw, UserX, Users } from 'lucide-react';
import { toast } from 'sonner';

import { useGlobalProgress } from '@/components/global-progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AdminInvitation } from '@/lib/auth/invitations';

const roleItems = [
  { label: 'User', value: 'user' },
  { label: 'Admin', value: 'admin' },
];
const INVITES_PER_PAGE = 10;

export function InvitationManagement({ initialInvitations }: { initialInvitations: AdminInvitation[] }) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [pending, setPending] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [page, setPage] = useState(1);
  const progress = useGlobalProgress();
  const totalPages = Math.max(1, Math.ceil(invitations.length / INVITES_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const visibleInvitations = invitations.slice((currentPage - 1) * INVITES_PER_PAGE, currentPage * INVITES_PER_PAGE);

  async function refreshInvitations() {
    const response = await fetch('/api/admin/invitations');
    const result = await response.json() as { invitations?: AdminInvitation[] };
    if (response.ok && result.invitations) {
      setInvitations(result.invitations);
      setPage((current) => Math.min(current, Math.max(1, Math.ceil(result.invitations!.length / INVITES_PER_PAGE))));
    }
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link);
    toast.success('Invitation link copied.');
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    const role = String(formData.get('role') ?? 'user');
    setPending('create'); progress.start();
    try {
      const response = await fetch('/api/admin/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) });
      const result = await response.json().catch(() => ({})) as { error?: string; shareUrl?: string | null };
      if (!response.ok) throw new Error(result.error || 'Unable to create the invitation.');
      form.reset();
      setInviteOpen(false);
      await refreshInvitations();
      if (result.shareUrl) {
        await copyLink(result.shareUrl);
        toast.success('Invitation created. The link is ready to share.');
      } else {
        toast.success('Invitation created. It will appear when the user signs in.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create the invitation.');
    } finally { setPending(null); progress.done(); }
  }

  async function updateInvitation(id: string, action: 'revoke' | 'regenerate') {
    setPending(id); progress.start();
    try {
      const response = await fetch(`/api/admin/invitations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const result = await response.json().catch(() => ({})) as { error?: string; shareUrl?: string | null };
      if (!response.ok) throw new Error(result.error || 'Unable to update the invitation.');
      await refreshInvitations();
      if (result.shareUrl) await copyLink(result.shareUrl);
      toast.success(action === 'revoke' ? 'Invitation revoked.' : 'A new invitation link was created and copied.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update the invitation.');
    } finally { setPending(null); progress.done(); }
  }

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => { setPage(1); setListOpen(true); }}><Users />View invites</Button>
        <Button onClick={() => setInviteOpen(true)}><MailPlus />Invite</Button>
      </div>

      <AlertDialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <form className="contents" onSubmit={invite}>
            <AlertDialogHeader>
              <AlertDialogTitle>Invite</AlertDialogTitle>
              <AlertDialogDescription>Choose the account type this person should receive when they accept.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="invite-email" className="text-sm font-medium">Email address</label>
                <Input id="invite-email" name="email" type="email" autoComplete="email" placeholder="person@example.com" required disabled={pending !== null} />
              </div>
              <div className="space-y-2">
                <label htmlFor="invite-role" className="text-sm font-medium">User type</label>
                <Select name="role" defaultValue="user" items={roleItems} disabled={pending !== null} required>
                  <SelectTrigger id="invite-role" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {roleItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending !== null}>Cancel</AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={pending !== null}>{pending === 'create' ? 'Inviting…' : 'Invite'}</AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={listOpen} onOpenChange={setListOpen}>
        <AlertDialogContent size="lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Invites</AlertDialogTitle>
            <AlertDialogDescription>Review invited users, roles, statuses, and expiration dates.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-lg border">
            <table className="w-full min-w-160 text-left text-sm">
              <thead className="sticky top-0 bg-muted/95 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                <tr><th className="px-4 py-3 font-medium">Email</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Expires</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr>
              </thead>
              <tbody className="divide-y">
                {invitations.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No invitations yet.</td></tr>}
                {visibleInvitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td className="px-4 py-3 font-medium">{invitation.email}</td>
                    <td className="px-4 py-3"><Badge variant="outline">{invitation.role === 'admin' ? 'Admin' : 'User'}</Badge></td>
                    <td className="px-4 py-3"><Badge variant={invitation.status === 'pending' ? 'secondary' : 'outline'}>{invitation.status}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(invitation.expiresAt))}</td>
                    <td className="px-4 py-3">
                      {invitation.status === 'pending' && <div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={pending !== null} onClick={() => updateInvitation(invitation.id, 'regenerate')}><RotateCw />New link</Button><Button size="sm" variant="outline" disabled={pending !== null} onClick={() => updateInvitation(invitation.id, 'revoke')}><UserX />Revoke</Button></div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between gap-4 border-t bg-background px-4 py-3">
              <p className="text-sm text-muted-foreground">Page {currentPage} of {totalPages} · {invitations.length} invite{invitations.length === 1 ? '' : 's'}</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={pending !== null || currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                <Button type="button" variant="outline" size="sm" disabled={pending !== null || currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</Button>
              </div>
            </div>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Link2 className="size-3.5" />Links expire after seven days. Only their hashed tokens are stored.</p>
          <AlertDialogFooter><AlertDialogCancel disabled={pending !== null}>Close</AlertDialogCancel></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

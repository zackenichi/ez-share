'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Building2, KeyRound, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useGlobalProgress } from '@/components/global-progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import type { AdminInvitation } from '@/lib/auth/invitations';
import type { WorkspaceInvitation } from '@/lib/teams/workspace-invitations';
import { getOrCreateDeviceIdentity, unwrapWorkspaceKey, wrapWorkspaceKey } from '@/lib/vault/client-crypto';

type VaultAccessRequest = { id: string; teamId: string; teamName: string; requesterUid: string; requesterName: string; requesterEmail: string; deviceId: string; expiresAt: string };
type AccessNotification = { id: string; message: string; href: string; createdAt: string | null };

export function NotificationCenter({ invitation, initialWorkspaceInvitations = [] }: { invitation: AdminInvitation | null; initialWorkspaceInvitations?: WorkspaceInvitation[] }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [workspaceInvitations, setWorkspaceInvitations] = useState(initialWorkspaceInvitations);
  const [vaultRequests, setVaultRequests] = useState<VaultAccessRequest[]>([]);
  const [accessNotifications, setAccessNotifications] = useState<AccessNotification[]>([]);
  const knownIds = useRef(new Set(initialWorkspaceInvitations.map(item => item.id)));
  const knownVaultRequestIds = useRef(new Set<string>());
  const lastRefreshAt = useRef(0);
  const router = useRouter(); const progress = useGlobalProgress();
  const count = workspaceInvitations.length + vaultRequests.length + accessNotifications.length + (invitation ? 1 : 0);

  const refreshInvitations = useCallback(async () => {
    if (Date.now() - lastRefreshAt.current < 30_000) return;
    lastRefreshAt.current = Date.now();
    try {
      const [response, accessResponse, notificationsResponse] = await Promise.all([fetch('/api/workspace-invitations', { cache: 'no-store' }), fetch('/api/vault-access-requests', { cache: 'no-store' }), fetch('/api/notifications', { cache: 'no-store' })]);
      if (response.ok) {
        const result = await response.json() as { invitations?: WorkspaceInvitation[] };
        const next = result.invitations || [];
        const added = next.find(item => !knownIds.current.has(item.id));
        next.forEach(item => knownIds.current.add(item.id));
        setWorkspaceInvitations(next);
        if (added) toast.info(`Invite to ${added.teamName}`, { action: { label: 'View', onClick: () => setOpen(true) } });
      }
      if (accessResponse.ok) {
        const accessResult = await accessResponse.json() as { requests?: VaultAccessRequest[] }; const requests = accessResult.requests || [];
        const addedRequest = requests.find(item => !knownVaultRequestIds.current.has(item.id));
        requests.forEach(item => knownVaultRequestIds.current.add(item.id)); setVaultRequests(requests);
        if (addedRequest) toast.info(`${addedRequest.requesterName} requested Vault access`, { action: { label: 'Review', onClick: () => setOpen(true) } });
      }
      if (notificationsResponse.ok) {
        const result = await notificationsResponse.json() as { notifications?: AccessNotification[] };
        setAccessNotifications(result.notifications || []);
      }
    } catch { lastRefreshAt.current = 0; }
  }, []);

  useEffect(() => {
    function onFocus() { void refreshInvitations(); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshInvitations]);

  async function respondVaultRequest(item: VaultAccessRequest, action: 'approve' | 'decline') {
    setPending(`${item.id}-${action}`); progress.start();
    try {
      if (action === 'approve') {
        const identity = await getOrCreateDeviceIdentity();
        const bootstrapResponse = await fetch(`/api/teams/${item.teamId}/vault?deviceId=${encodeURIComponent(identity.deviceId)}&recipients=1`, { cache: 'no-store' });
        const bootstrap = await bootstrapResponse.json() as { error?: string; envelope?: string | null; recipients?: Array<{ uid: string; deviceId: string; publicKeyJwk: JsonWebKey }> };
        if (!bootstrapResponse.ok || !bootstrap.envelope) throw new Error(bootstrap.error || 'Approve this request from a device that already has Vault access.');
        const recipient = bootstrap.recipients?.find(candidate => candidate.uid === item.requesterUid && candidate.deviceId === item.deviceId);
        if (!recipient) throw new Error('The requesting device is no longer available. Ask the member to request access again.');
        const workspaceKey = await unwrapWorkspaceKey(bootstrap.envelope, identity.privateKey);
        const wrappedKey = await wrapWorkspaceKey(workspaceKey, recipient.publicKeyJwk);
        const envelopeResponse = await fetch(`/api/teams/${item.teamId}/vault`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'putEnvelope', senderDeviceId: identity.deviceId, deviceId: item.deviceId, recipientUid: item.requesterUid, wrappedKey }) });
        const envelopeResult = await envelopeResponse.json() as { error?: string }; if (!envelopeResponse.ok) throw new Error(envelopeResult.error || 'Unable to grant Vault access.');
      }
      const response = await fetch(`/api/vault-access-requests/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || 'Unable to update the request.');
      setVaultRequests(current => current.filter(request => request.id !== item.id));
      toast.success(action === 'approve' ? `Vault access granted to ${item.requesterName}.` : 'Vault access request declined.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update the request.'); }
    finally { setPending(null); progress.done(); }
  }

  async function respondAdmin(action: 'accept' | 'decline') {
    if (!invitation) return; setPending(`admin-${action}`); progress.start();
    try {
      const response = await fetch(`/api/invitations/${invitation.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to respond.');
      toast.success(action === 'accept' ? 'Invitation accepted.' : 'Invitation declined.'); setOpen(false); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to respond.'); }
    finally { setPending(null); progress.done(); }
  }

  async function respondWorkspace(item: WorkspaceInvitation, action: 'accept' | 'decline') {
    setPending(`${item.id}-${action}`); progress.start();
    try {
      const response = await fetch(`/api/workspace-invitations/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const result = await response.json().catch(() => ({})) as { error?: string; href?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to respond.');
      setWorkspaceInvitations(current => current.filter(candidate => candidate.id !== item.id));
      toast.success(action === 'accept' ? `Joined ${item.teamName}.` : 'Invitation declined.'); setOpen(false);
      if (action === 'accept' && result.href) router.push(result.href); else router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to respond.'); }
    finally { setPending(null); progress.done(); }
  }

  async function dismissAccessNotification(id: string) {
    setAccessNotifications(current => current.filter(item => item.id !== id));
    const response = await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
    if (!response.ok) {
      lastRefreshAt.current = 0;
      void refreshInvitations();
      toast.error('Unable to dismiss notification.');
    }
  }

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) void refreshInvitations();
  }

  return <Popover open={open} onOpenChange={changeOpen}>
    <PopoverTrigger render={<Button variant="ghost" size="icon" aria-label={count ? `Open notifications, ${count} unread` : 'Open notifications'} className="relative" />}><Bell />{count > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-background" aria-hidden="true" />}</PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} className="max-h-[min(32rem,calc(100vh-5rem))] w-88 overflow-y-auto">
      <PopoverHeader className="border-b pb-2"><div className="flex items-center justify-between"><PopoverTitle>Notifications</PopoverTitle>{count > 0 && <Badge variant="secondary">{count} new</Badge>}</div><PopoverDescription>Invitations and updates.</PopoverDescription></PopoverHeader>
      {count === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">You’re all caught up.</p>}
      {invitation && <div className="rounded-lg bg-primary/5 p-3"><div className="flex gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="size-4" /></div><div><p className="text-sm font-medium">Account invitation</p><p className="mt-1 text-xs text-muted-foreground">From {invitation.invitedByName}</p></div></div><div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" disabled={pending !== null} onClick={() => respondAdmin('decline')}>{pending === 'admin-decline' ? 'Declining…' : 'Decline'}</Button><Button size="sm" disabled={pending !== null} onClick={() => respondAdmin('accept')}>{pending === 'admin-accept' ? 'Accepting…' : 'Accept'}</Button></div></div>}
      {accessNotifications.map(item => <div key={item.id} className="rounded-lg bg-primary/5 p-3"><div className="flex gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="size-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium">Access changed</p><p className="mt-1 text-xs text-muted-foreground">{item.message}</p></div></div><div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => void dismissAccessNotification(item.id)}>Dismiss</Button><Button size="sm" onClick={() => router.push(item.href)}>View</Button></div></div>)}
      {workspaceInvitations.map(item => <div key={item.id} className="rounded-lg bg-primary/5 p-3"><div className="flex gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Building2 className="size-4" /></div><div className="min-w-0"><p className="truncate text-sm font-medium">Join {item.teamName}</p><p className="mt-1 text-xs text-muted-foreground">From {item.invitedByName}</p></div></div><div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" disabled={pending !== null} onClick={() => respondWorkspace(item, 'decline')}>{pending === `${item.id}-decline` ? 'Declining…' : 'Decline'}</Button><Button size="sm" disabled={pending !== null} onClick={() => respondWorkspace(item, 'accept')}>{pending === `${item.id}-accept` ? 'Joining…' : 'Accept'}</Button></div></div>)}
      {vaultRequests.map(item => <div key={item.id} className="rounded-lg bg-primary/5 p-3"><div className="flex gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><KeyRound className="size-4" /></div><div className="min-w-0"><p className="truncate text-sm font-medium">Vault access request</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.requesterName} · {item.teamName}</p></div></div><div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" disabled={pending !== null} onClick={() => respondVaultRequest(item, 'decline')}>{pending === `${item.id}-decline` ? 'Declining…' : 'Decline'}</Button><Button size="sm" disabled={pending !== null} onClick={() => respondVaultRequest(item, 'approve')}>{pending === `${item.id}-approve` ? 'Approving…' : 'Approve'}</Button></div></div>)}
    </PopoverContent>
  </Popover>;
}

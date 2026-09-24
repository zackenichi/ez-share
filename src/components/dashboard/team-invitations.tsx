'use client';

import { useState, type FormEvent } from 'react';
import { Copy, MailPlus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useGlobalProgress } from '@/components/global-progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import type { WorkspaceInvitation } from '@/lib/teams/workspace-invitations';

export type WorkspaceMember = {
  uid: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  canEdit: boolean;
  canShare: boolean;
  canManageAccess: boolean;
};
type EditablePerson = {
  type: 'member' | 'invitation';
  id: string;
  label: string;
  canEdit: boolean;
  canShare: boolean;
  canManageAccess: boolean;
};

function permissions(canEdit: boolean, canShare: boolean, canManageAccess: boolean) {
  return (
    [canEdit && 'Edit', canShare && 'Share', canManageAccess && 'Manage access'].filter(Boolean).join(' · ') ||
    'View'
  );
}

export function TeamInvitations({
  teamId,
  canShare,
  isOwner,
  members: initialMembers = [],
  initialInvitations = [],
  currentPage,
  totalPages,
  totalItems,
}: {
  teamId: string;
  canShare: boolean;
  isOwner: boolean;
  members?: WorkspaceMember[];
  initialInvitations?: WorkspaceInvitation[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
}) {
  const [pending, setPending] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditablePerson | null>(null);
  const [removeTarget, setRemoveTarget] = useState<EditablePerson | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>(() =>
    Array.isArray(initialMembers) ? initialMembers : [],
  );
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>(() =>
    Array.isArray(initialInvitations) ? initialInvitations : [],
  );
  const progress = useGlobalProgress();
  const router = useRouter();

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    progress.start();
    try {
      const response = await fetch(`/api/teams/${teamId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.get('email'),
          canEdit: data.get('canEdit') === 'on',
          canShare: data.get('canShare') === 'on',
          canManageAccess: data.get('canManageAccess') === 'on',
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        shareUrl?: string;
        invitation?: WorkspaceInvitation;
      };
      if (!response.ok) throw new Error(result.error);
      if (result.shareUrl) await navigator.clipboard.writeText(result.shareUrl);
      if (result.invitation)
        setInvitations((current) => [
          result.invitation!,
          ...current.filter((item) => item.id !== result.invitation!.id),
        ]);
      form.reset();
      setInviteOpen(false);
      toast.success('Invitation created and link copied.');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to invite.');
    } finally {
      setPending(false);
      progress.done();
    }
  }

  async function savePermissions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;
    const data = new FormData(event.currentTarget);
    const next = {
      canEdit: data.get('canEdit') === 'on',
      canShare: data.get('canShare') === 'on',
      canManageAccess: data.get('canManageAccess') === 'on',
    };
    const path =
      editTarget.type === 'member'
        ? `members/${editTarget.id}`
        : `invitations/${editTarget.id}`;
    setPending(true);
    progress.start();
    try {
      const response = await fetch(`/api/teams/${teamId}/${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      if (editTarget.type === 'member')
        setMembers((current) =>
          current.map((item) =>
            item.uid === editTarget.id ? { ...item, ...next } : item,
          ),
        );
      else
        setInvitations((current) =>
          current.map((item) =>
            item.id === editTarget.id ? { ...item, ...next } : item,
          ),
        );
      setEditTarget(null);
      toast.success('Permissions updated.');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to update permissions.',
      );
    } finally {
      setPending(false);
      progress.done();
    }
  }

  async function removePerson() {
    if (!removeTarget) return;
    const path =
      removeTarget.type === 'member'
        ? `members/${removeTarget.id}`
        : `invitations/${removeTarget.id}`;
    setPending(true);
    progress.start();
    try {
      const response = await fetch(`/api/teams/${teamId}/${path}`, {
        method: 'DELETE',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      if (removeTarget.type === 'member')
        setMembers((current) =>
          current.filter((item) => item.uid !== removeTarget.id),
        );
      else
        setInvitations((current) =>
          current.filter((item) => item.id !== removeTarget.id),
        );
      setRemoveTarget(null);
      toast.success(
        removeTarget.type === 'member'
          ? 'Member removed.'
          : 'Invitation revoked.',
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to remove this person.',
      );
    } finally {
      setPending(false);
      progress.done();
    }
  }

  async function copyInvite(invitationId: string) {
    setPending(true);
    progress.start();
    try {
      const response = await fetch(
        `/api/teams/${teamId}/invitations/${invitationId}`,
        { method: 'POST' },
      );
      const result = (await response.json()) as {
        error?: string;
        shareUrl?: string;
      };
      if (!response.ok || !result.shareUrl)
        throw new Error(result.error || 'Unable to copy invite.');
      await navigator.clipboard.writeText(result.shareUrl);
      toast.success('Invite link copied.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to copy invite.',
      );
    } finally {
      setPending(false);
      progress.done();
    }
  }

  function actions(target: EditablePerson) {
    if (!canShare || (target.type === 'member' && !isOwner)) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${target.label}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {target.type === 'invitation' && (
            <DropdownMenuItem onClick={() => copyInvite(target.id)}>
              <Copy />
              Copy link
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setEditTarget(target)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setRemoveTarget(target)}
          >
            <Trash2 />
            {target.type === 'member' ? 'Remove' : 'Revoke'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Team
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            People with access to this workspace.
          </p>
        </div>
        {canShare && (
          <AlertDialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <AlertDialogTrigger render={<Button />}>
              <MailPlus />
              Invite member
            </AlertDialogTrigger>
            <AlertDialogContent>
              <form className="contents" onSubmit={submitInvite}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Invite member</AlertDialogTitle>
                  <AlertDialogDescription>
                    Choose the Vault and sharing permissions for this member.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-4">
                  <Input
                    name="email"
                    type="email"
                    placeholder="person@example.com"
                    required
                    disabled={pending}
                  />
                  <label className="flex items-center gap-3 text-sm">
                    <Checkbox name="canEdit" disabled={pending} />
                    Can edit Vault content
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <Checkbox name="canShare" disabled={pending} />
                    Can share and invite members
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <Checkbox name="canManageAccess" disabled={pending} />
                    Can manage folder access
                  </label>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction type="submit" disabled={pending}>
                    {pending ? 'Inviting…' : 'Invite'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </form>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Access</th>
              <th className="w-24 px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((member) => (
              <tr key={member.uid}>
                <td className="px-4 py-3">
                  <p className="font-medium">{member.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.email}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary">Active</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{member.role}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {member.role === 'owner'
                    ? 'Full access'
                    : permissions(member.canEdit, member.canShare, member.canManageAccess)}
                </td>
                <td className="px-4 py-2">
                  {member.role !== 'owner' &&
                    actions({
                      type: 'member',
                      id: member.uid,
                      label: member.name,
                      canEdit: member.canEdit,
                      canShare: member.canShare,
                      canManageAccess: member.canManageAccess,
                    })}
                </td>
              </tr>
            ))}
            {invitations
              .filter((invite) => invite.status === 'pending')
              .map((invite) => (
                <tr key={`invite-${invite.id}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{invite.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">Pending</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">member</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {permissions(invite.canEdit, invite.canShare, invite.canManageAccess)}
                  </td>
                  <td className="px-4 py-2">
                    {actions({
                      type: 'invitation',
                      id: invite.id,
                      label: invite.email,
                      canEdit: invite.canEdit,
                      canShare: invite.canShare,
                      canManageAccess: invite.canManageAccess,
                    })}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages} · {totalItems}{' '}
            {totalItems === 1 ? 'person' : 'people'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              render={
                currentPage > 1 ? (
                  <Link
                    href={`/workspace/${teamId}/team?page=${currentPage - 1}`}
                  />
                ) : undefined
              }
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              render={
                currentPage < totalPages ? (
                  <Link
                    href={`/workspace/${teamId}/team?page=${currentPage + 1}`}
                  />
                ) : undefined
              }
            >
              Next
            </Button>
          </div>
        </div>
      </div>
      <AlertDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setEditTarget(null);
        }}
      >
        <AlertDialogContent>
          {editTarget && (
            <form className="contents" onSubmit={savePermissions}>
              <AlertDialogHeader>
                <AlertDialogTitle>Edit access</AlertDialogTitle>
                <AlertDialogDescription>
                  {editTarget.label}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-4">
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    name="canEdit"
                    defaultChecked={editTarget.canEdit}
                    disabled={pending}
                  />
                  Can edit
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    name="canShare"
                    defaultChecked={editTarget.canShare}
                    disabled={pending}
                  />
                  Can share
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    name="canManageAccess"
                    defaultChecked={editTarget.canManageAccess}
                    disabled={pending}
                  />
                  Can manage folder access
                </label>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                <AlertDialogAction type="submit" disabled={pending}>
                  {pending ? 'Saving…' : 'Save'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </form>
          )}
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removeTarget?.type === 'member'
                ? 'Remove member?'
                : 'Revoke invitation?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.type === 'member'
                ? `${removeTarget.label} will immediately lose access to this workspace.`
                : `${removeTarget?.label} will no longer be able to accept this invitation.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={removePerson}
            >
              {pending
                ? 'Removing…'
                : removeTarget?.type === 'member'
                  ? 'Remove member'
                  : 'Revoke invitation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

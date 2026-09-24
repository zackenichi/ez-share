'use client';

import { useMemo, useState } from 'react';
import { MoreHorizontal, Search, Shield, Trash2, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';

import { useGlobalProgress } from '@/components/global-progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type ManagedUser = {
  uid: string;
  name: string;
  email: string;
  photoURL: string | null;
  role: 'admin' | 'user';
  disabled: boolean;
  protected: boolean;
  current: boolean;
  lastSignIn: string | null;
};

const USERS_PER_PAGE = 10;

function UserActions({
  user,
  disabled,
  onUpdate,
  onDelete,
  appName,
}: {
  user: ManagedUser;
  disabled: boolean;
  onUpdate: (body: { role?: 'admin' | 'user'; disabled?: boolean }) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  appName: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function update(body: { role?: 'admin' | 'user'; disabled?: boolean }) {
    setMenuOpen(false);
    await onUpdate(body);
  }

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Manage ${user.name}`} disabled={disabled} />}>
          <MoreHorizontal />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 gap-1 p-1.5">
          <Button variant="ghost" className="w-full justify-start" onClick={() => update({ role: user.role === 'admin' ? 'user' : 'admin' })}>
            <Shield />{user.role === 'admin' ? 'Make user' : 'Make admin'}
          </Button>
          <Button variant="ghost" className="w-full justify-start" onClick={() => update({ disabled: !user.disabled })}>
            {user.disabled ? <UserCheck /> : <UserX />}{user.disabled ? 'Reactivate account' : 'Suspend account'}
          </Button>
          <Button variant="destructive" className="w-full justify-start" onClick={() => { setMenuOpen(false); setDeleteOpen(true); }}>
            <Trash2 />Delete user
          </Button>
        </PopoverContent>
      </Popover>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive"><Trash2 /></AlertDialogMedia>
            <AlertDialogTitle>Delete {user.name}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the {appName} account and its user profile. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disabled}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={disabled} onClick={async () => { if (await onDelete()) setDeleteOpen(false); }}>
              {disabled ? 'Deleting…' : 'Delete user'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function UserManagement({ initialUsers, initialNextPageToken, appName }: { initialUsers: ManagedUser[]; initialNextPageToken: string | null; appName: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState('');
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [pagePending, setPagePending] = useState(false);
  const [page, setPage] = useState(1);
  const [currentPageToken, setCurrentPageToken] = useState<string | null>(null);
  const [previousPageTokens, setPreviousPageTokens] = useState<(string | null)[]>([]);
  const [nextPageToken, setNextPageToken] = useState(initialNextPageToken);
  const [error, setError] = useState('');
  const progress = useGlobalProgress();

  const visibleUsers = useMemo(() => {
    const search = query.trim().toLowerCase();
    return search ? users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search)) : users;
  }, [query, users]);
  const emptyRowCount = Math.max(0, USERS_PER_PAGE - visibleUsers.length);

  async function loadPage(pageToken: string | null, direction: 'next' | 'previous') {
    setPagePending(true); setError(''); progress.start();
    try {
      const url = new URL('/api/admin/users', window.location.origin);
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await fetch(url);
      const result = await response.json() as { users?: ManagedUser[]; nextPageToken?: string | null; error?: string };
      if (!response.ok || !result.users) {
        const message = result.error || 'Unable to load users.';
        setError(message); toast.error(message); return;
      }

      if (direction === 'next') {
        setPreviousPageTokens((tokens) => [...tokens, currentPageToken]);
        setPage((value) => value + 1);
      } else {
        setPreviousPageTokens((tokens) => tokens.slice(0, -1));
        setPage((value) => Math.max(1, value - 1));
      }
      setCurrentPageToken(pageToken);
      setNextPageToken(result.nextPageToken ?? null);
      setUsers(result.users);
      setQuery('');
    } catch {
      const message = 'Unable to reach the server. Please try again.';
      setError(message); toast.error(message);
    } finally {
      setPagePending(false); progress.done();
    }
  }

  async function updateUser(uid: string, body: { role?: 'admin' | 'user'; disabled?: boolean }) {
    setPendingUid(uid); setError(''); progress.start();
    try {
      const response = await fetch(`/api/admin/users/${uid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        const message = result.error || 'Unable to update the user.';
        setError(message); toast.error(message); return false;
      }
      setUsers((current) => current.map((user) => user.uid === uid ? { ...user, ...body } : user));
      toast.success('User updated successfully.');
      return true;
    } catch {
      const message = 'Unable to reach the server. Please try again.';
      setError(message); toast.error(message);
      return false;
    } finally {
      setPendingUid(null); progress.done();
    }
  }

  async function deleteUser(uid: string) {
    setPendingUid(uid); setError(''); progress.start();
    try {
      const response = await fetch(`/api/admin/users/${uid}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        const message = result.error || 'Unable to delete the user.';
        setError(message); toast.error(message); return false;
      }
      setUsers((current) => current.filter((user) => user.uid !== uid));
      toast.success('User deleted successfully.');
      return true;
    } catch {
      const message = 'Unable to reach the server. Please try again.';
      setError(message); toast.error(message);
      return false;
    } finally {
      setPendingUid(null); progress.done();
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="relative mt-3 max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search this page" /></div>
        {error && <p role="alert" className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <table className="w-full text-left text-sm">
          <thead className="border-y bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-medium">User</th><th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Last sign-in</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead>
          <tbody className="divide-y">
            {visibleUsers.map((user) => {
              const initials = user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
              const locked = user.protected || user.current || pendingUid === user.uid;
              return (
                <tr key={user.uid} className="hover:bg-muted/30">
                  <td className="px-4 py-4"><div className="flex min-w-56 items-center gap-3"><Avatar>{user.photoURL && <AvatarImage src={user.photoURL} alt="" />}<AvatarFallback>{initials || 'U'}</AvatarFallback></Avatar><div><div className="flex items-center gap-2"><p className="font-medium">{user.name}</p>{user.current && <Badge variant="outline">You</Badge>}{user.protected && <Badge variant="outline">Root</Badge>}</div><p className="text-xs text-muted-foreground">{user.email}</p></div></div></td>
                  <td className="px-4 py-4"><Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role === 'admin' ? 'Admin' : 'User'}</Badge></td>
                  <td className="px-4 py-4"><Badge variant="outline" className={user.disabled ? 'text-destructive' : 'text-emerald-700'}>{user.disabled ? 'Suspended' : 'Active'}</Badge></td>
                  <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{user.lastSignIn ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(user.lastSignIn)) : 'Never'}</td>
                  <td className="px-4 py-4 text-right">
                    <UserActions
                      user={user}
                      disabled={locked}
                      appName={appName}
                      onUpdate={(body) => updateUser(user.uid, body)}
                      onDelete={() => deleteUser(user.uid)}
                    />
                  </td>
                </tr>
              );
            })}
            {!visibleUsers.length && <tr className="h-[69px]"><td colSpan={5} className="px-4 text-center text-muted-foreground">No users found.</td></tr>}
            {Array.from({ length: Math.max(0, emptyRowCount - (visibleUsers.length ? 0 : 1)) }, (_, index) => (
              <tr key={`empty-${index}`} aria-hidden="true" className="h-[69px]">
                <td colSpan={5} />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">Page {page} · {users.length} user{users.length === 1 ? '' : 's'}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pagePending || previousPageTokens.length === 0} onClick={() => loadPage(previousPageTokens.at(-1) ?? null, 'previous')}>Previous</Button>
            <Button variant="outline" size="sm" disabled={pagePending || !nextPageToken} onClick={() => nextPageToken && loadPage(nextPageToken, 'next')}>Next</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

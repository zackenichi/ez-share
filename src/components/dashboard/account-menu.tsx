'use client';

import { useState } from 'react';
import { ChevronDown, CircleUserRound, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { toast } from 'sonner';

import { useGlobalProgress } from '@/components/global-progress';
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { firebaseAuth } from '@/lib/firebase/client';

type AccountMenuProps = {
  name: string;
  email: string;
  photoURL: string | null;
};

export function AccountMenu({ name, email, photoURL }: AccountMenuProps) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const progress = useGlobalProgress();

  async function logout() {
    if (pending) return;
    setPending(true);
    progress.start();
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Unable to sign out.');
      await signOut(firebaseAuth);
      toast.success('Signed out successfully.');
      router.replace('/');
      router.refresh();
    } catch {
      toast.error('Unable to sign out. Please try again.');
      setPending(false);
    } finally {
      progress.done();
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-12 max-w-64 gap-2 px-1.5 sm:px-2"
            aria-label={`Open account menu for ${name}`}
          />
        }
      >
        <Avatar size="lg">
          {photoURL && <AvatarImage src={photoURL} alt={`${name}'s profile picture`} />}
          <AvatarFallback>{name ? name.slice(0, 2).toUpperCase() : <CircleUserRound className="size-5" />}</AvatarFallback>
          <AvatarBadge className="bg-emerald-500" />
        </Avatar>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-sm font-medium leading-none">{name}</span>
          <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">{email}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={6} className="w-60">
        <DropdownMenuGroup className="sm:hidden">
          <DropdownMenuLabel>
            <span className="block truncate text-sm text-foreground">{name}</span>
            <span className="mt-0.5 block truncate font-normal">{email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="sm:hidden" />
        <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
          <Settings aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={pending} onClick={logout}>
          <LogOut aria-hidden="true" />
          {pending ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

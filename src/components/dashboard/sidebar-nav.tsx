'use client';

import Link from 'next/link';
import { KeyRound, Settings, ShieldCheck, StickyNote, Users, Vault } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export function SidebarNav({ currentWorkspaceId, showVault, showTeam, showUserManagement, showWorkspaceSettings }: { currentWorkspaceId: string | null; showVault: boolean; showTeam: boolean; showUserManagement: boolean; showWorkspaceSettings: boolean }) {
  const pathname = usePathname();
  const workspacePath = currentWorkspaceId ? `/workspace/${currentWorkspaceId}` : pathname.match(/^\/workspace\/[^/]+/)?.[0];
  const items = [
    ...(workspacePath && showVault ? [{ href: `${workspacePath}/vault`, label: 'Vault', icon: Vault, showProgress: true }] : []),
    ...(workspacePath && showVault ? [{ href: `${workspacePath}/passwords`, label: 'Passwords', icon: KeyRound, showProgress: false }] : []),
    ...(workspacePath && showVault ? [{ href: `${workspacePath}/notes`, label: 'Notes', icon: StickyNote, showProgress: false }] : []),
    ...(workspacePath && showTeam ? [{ href: `${workspacePath}/team`, label: 'Team', icon: Users, showProgress: true }] : []),
    ...(workspacePath && showWorkspaceSettings ? [{ href: `${workspacePath}/settings`, label: 'Workspace settings', icon: Settings, showProgress: true }] : []),
    ...(showUserManagement ? [{ href: '/dashboard/admin', label: 'User management', icon: ShieldCheck, showProgress: true }] : []),
  ];

  return (
    <nav aria-label="Dashboard navigation" className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            data-no-progress={item.showProgress ? undefined : 'true'}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Building2, Check, ChevronsUpDown, LoaderCircle, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useGlobalProgress } from '@/components/global-progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Team } from '@/lib/teams/teams';
import { WORKSPACE_NAME_MAX_LENGTH } from '@/lib/teams/validation';
import { workspaceLandingHref } from '@/lib/teams/routes';

export function TeamSwitcher({ teams, currentTeam, error }: { teams: Team[]; currentTeam: Team | null; error: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [creating, setCreating] = useState(false);
  const [searchResults, setSearchResults] = useState<Team[]>([]);
  const [searchResultQuery, setSearchResultQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const router = useRouter();
  const progress = useGlobalProgress();
  const filteredTeams = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery ? teams.filter((team) => team.name.toLowerCase().includes(normalizedQuery)) : teams;
  }, [query, teams]);
  const normalizedQuery = query.trim();
  const currentSearchResults = searchResultQuery === normalizedQuery.toLowerCase() ? searchResults : [];
  const displayedTeams = filteredTeams.length > 0 ? filteredTeams : currentSearchResults;

  useEffect(() => {
    if (!normalizedQuery || filteredTeams.length > 0) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      try {
        const response = await fetch(`/api/teams?q=${encodeURIComponent(normalizedQuery)}`, { signal: controller.signal });
        const result = await response.json().catch(() => ({})) as { error?: string; workspaces?: Team[] };
        if (!response.ok) throw new Error(result.error || 'Unable to search workspaces.');
        setSearchResults(result.workspaces ?? []);
        setSearchResultQuery(normalizedQuery.toLowerCase());
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSearchError(true);
        setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [filteredTeams.length, normalizedQuery]);

  async function switchTeam(team: Team) {
    if (pendingTeamId) return;
    if (team.id === currentTeam?.id) {
      setOpen(false);
      return;
    }

    setPendingTeamId(team.id);
    progress.start();
    try {
      const response = await fetch('/api/teams/current', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: team.id }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; name?: string; href?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to switch workspaces.');
      toast.success(`Switched to ${result.name || 'workspace'}.`);
      setOpen(false);
      setQuery('');
      const href = result.href || workspaceLandingHref(team.id);
      progress.startNavigation(href);
      router.push(href);
    } catch (switchError) {
      toast.error(switchError instanceof Error ? switchError.message : 'Unable to switch workspaces.');
    } finally {
      setPendingTeamId(null);
      progress.done();
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    const name = workspaceName.trim();
    if (!name) return;

    setCreating(true);
    progress.start();
    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; name?: string; href?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to create the workspace.');
      toast.success(`${result.name || 'Workspace'} created.`);
      setCreateOpen(false);
      setWorkspaceName('');
      const href = result.href || '/dashboard';
      progress.startNavigation(href);
      router.push(href);
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Unable to create the workspace.');
    } finally {
      setCreating(false);
      progress.done();
    }
  }

  const unavailableLabel = error ? 'Workspaces unavailable' : 'No workspaces';

  return (
    <div className="min-w-0" aria-busy={pendingTeamId !== null}>
      <Popover open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery(''); }}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              disabled={pendingTeamId !== null || creating}
              className="h-13 w-full justify-start gap-3 rounded-xl bg-muted/40 px-3 shadow-none"
              aria-label="Choose workspace"
            />
          }
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            {pendingTeamId ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Building2 aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-left font-medium">{currentTeam?.name ?? unavailableLabel}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="start" side="right" sideOffset={8} className="w-80 gap-0 p-0">
          <div className="relative border-b p-2">
            <Search className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search recent workspaces"
              aria-label="Search recent workspaces"
              className="h-9 pl-9"
            />
          </div>
          <p className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{normalizedQuery ? 'Search results' : 'Recent workspaces'}</p>
          <div className="max-h-72 overflow-y-auto p-1.5" role="listbox" aria-label={normalizedQuery ? 'Workspace search results' : 'Recent workspaces'}>
            {displayedTeams.map((team) => {
              const selected = team.id === currentTeam?.id;
              const pending = team.id === pendingTeamId;
              return (
                <button
                  key={team.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={pendingTeamId !== null}
                  onClick={() => switchTeam(team)}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  {pending && <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate font-medium">{team.name}</span>
                  <Check className={cn('size-4 text-primary', !selected && 'invisible')} aria-hidden="true" />
                </button>
              );
            })}
            {searching && <p className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Searching workspaces…</p>}
            {!searching && searchError && <p className="px-3 py-8 text-center text-sm text-destructive" role="status">Unable to search workspaces.</p>}
            {!searching && !searchError && displayedTeams.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">No workspace matches your search.</p>}
          </div>
          <div className="border-t p-1.5">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => { setOpen(false); setCreateOpen(true); }}
            >
              <Plus aria-hidden="true" />
              New workspace
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Dialog open={createOpen} onOpenChange={(nextOpen) => { if (!creating) setCreateOpen(nextOpen); }}>
        <DialogContent>
          <form onSubmit={createWorkspace} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Create a workspace</DialogTitle>
              <DialogDescription>Create a private workspace. You will be added as its owner.</DialogDescription>
            </DialogHeader>
            <div className="py-1">
              <label htmlFor="workspace-name" className="mb-2 block text-sm font-medium">Workspace name</label>
              <Input
                id="workspace-name"
                autoFocus
                required
                maxLength={WORKSPACE_NAME_MAX_LENGTH}
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="e.g. Product team"
                disabled={creating}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={creating} />}>Cancel</DialogClose>
              <Button type="submit" disabled={creating || !workspaceName.trim()}>
                {creating && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {creating ? 'Creating…' : 'Create workspace'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {error && <p className="mt-1.5 px-1 text-xs text-destructive" role="status">Could not load workspaces.</p>}
    </div>
  );
}

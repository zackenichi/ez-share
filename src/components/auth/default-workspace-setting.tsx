'use client';

import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useGlobalProgress } from '@/components/global-progress';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Team } from '@/lib/teams/teams';

export function DefaultWorkspaceSetting({ teams, initialTeamId }: { teams: Team[]; initialTeamId: string | null }) {
  const [teamId, setTeamId] = useState(initialTeamId);
  const [pending, setPending] = useState(false);
  const progress = useGlobalProgress();

  async function updateDefault(nextTeamId: string | null) {
    if (!nextTeamId || nextTeamId === teamId || pending) return;
    setPending(true); progress.start();
    try {
      const response = await fetch('/api/teams/default', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId: nextTeamId }) });
      const result = await response.json().catch(() => ({})) as { error?: string; name?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to set the default workspace.');
      setTeamId(nextTeamId); toast.success(`${result.name || 'Workspace'} is now your default workspace.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to set the default workspace.'); }
    finally { setPending(false); progress.done(); }
  }

  return (
    <Select
      value={teamId}
      items={teams.map((team) => ({ value: team.id, label: team.name }))}
      onValueChange={updateDefault}
      disabled={pending || teams.length === 0}
    >
      <SelectTrigger className="h-10 w-full max-w-md" aria-label="Default workspace">
        {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
        <SelectValue placeholder="Choose a default workspace" />
      </SelectTrigger>
      <SelectContent side="bottom" align="start" sideOffset={6} alignItemWithTrigger={false}>
        <SelectGroup>{teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectGroup>
      </SelectContent>
    </Select>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useGlobalProgress } from '@/components/global-progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { WORKSPACE_NAME_MAX_LENGTH } from '@/lib/teams/validation';

export function WorkspaceSettings({ workspaceId, initialName }: { workspaceId: string; initialName: string }) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const progress = useGlobalProgress();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); progress.start();
    try {
      const response = await fetch(`/api/teams/${workspaceId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const result = await response.json().catch(() => ({})) as { error?: string; name?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to update the workspace.');
      setName(result.name || name.trim()); toast.success('Workspace name updated.'); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update the workspace.'); }
    finally { setSaving(false); progress.done(); }
  }

  async function remove() {
    setDeleting(true); progress.start();
    try {
      const response = await fetch(`/api/teams/${workspaceId}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({})) as { error?: string; href?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to delete the workspace.');
      const href = result.href || '/dashboard'; toast.success('Workspace deleted.'); progress.startNavigation(href); router.replace(href);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to delete the workspace.'); setDeleting(false); }
    finally { progress.done(); }
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Workspace settings</h1></div>
      <Card>
        <CardHeader><CardTitle>General</CardTitle><CardDescription>Change how this workspace is displayed.</CardDescription></CardHeader>
        <CardContent><form onSubmit={save} className="flex max-w-xl flex-col gap-3 sm:flex-row"><Input aria-label="Workspace name" required maxLength={WORKSPACE_NAME_MAX_LENGTH} value={name} onChange={(event) => setName(event.target.value)} disabled={saving} /><Button type="submit" disabled={saving || !name.trim() || name.trim() === initialName}>{saving && <LoaderCircle className="animate-spin" />}{saving ? 'Saving…' : 'Save'}</Button></form></CardContent>
      </Card>
      <Card className="ring-destructive/20">
        <CardHeader><CardTitle className="text-destructive">Danger zone</CardTitle><CardDescription>You can delete this workspace only when you have another active workspace.</CardDescription></CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive" />}><Trash2 />Delete workspace</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogMedia className="bg-destructive/10 text-destructive"><Trash2 /></AlertDialogMedia><AlertDialogTitle>Delete {initialName}?</AlertDialogTitle><AlertDialogDescription>This archives the workspace and removes it from your workspace list. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deleting} onClick={remove}>{deleting ? 'Deleting…' : 'Delete workspace'}</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

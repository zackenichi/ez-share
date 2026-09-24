'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useGlobalProgress } from '@/components/global-progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ProfileForm({ initialName, email }: { initialName: string; email: string }) {
  const router = useRouter();
  const progress = useGlobalProgress();
  const [displayName, setDisplayName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [pending, setPending] = useState(false);

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = displayName.trim();
    if (!nextName) { toast.error('Enter a display name.'); return; }

    setPending(true); progress.start();
    try {
      const response = await fetch('/api/auth/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: nextName }),
      });
      const result = await response.json().catch(() => ({})) as { displayName?: string; error?: string };
      if (!response.ok || !result.displayName) throw new Error(result.error || 'Unable to update your profile.');

      setDisplayName(result.displayName);
      setSavedName(result.displayName);
      toast.success('Display name updated.');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update your profile.');
    } finally {
      setPending(false); progress.done();
    }
  }

  return (
    <form className="space-y-5" onSubmit={updateProfile}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="display-name" className="text-sm font-medium">Display name</label>
          <Input id="display-name" name="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} required />
        </div>
        <div className="space-y-2">
          <label htmlFor="account-email" className="text-sm font-medium">Email</label>
          <Input id="account-email" type="email" value={email} disabled />
        </div>
      </div>
      <Button type="submit" disabled={pending || !displayName.trim() || displayName.trim() === savedName}>{pending ? 'Saving…' : 'Save changes'}</Button>
    </form>
  );
}

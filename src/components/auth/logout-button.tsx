'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useGlobalProgress } from '@/components/global-progress';
import { Button } from '@/components/ui/button';
import { firebaseAuth } from '@/lib/firebase/client';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const progress = useGlobalProgress();

  return <Button variant="ghost" size="sm" disabled={pending} onClick={async () => {
    setPending(true); progress.start();
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
  }}><LogOut />{pending ? 'Signing out…' : 'Sign out'}</Button>;
}

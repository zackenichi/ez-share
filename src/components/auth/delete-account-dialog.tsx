'use client';

import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useGlobalProgress } from '@/components/global-progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { firebaseAuth } from '@/lib/firebase/client';

export function DeleteAccountDialog({ appName }: { appName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const progress = useGlobalProgress();

  async function deleteAccount() {
    setPending(true); setError(''); progress.start();
    try {
      const response = await fetch('/api/auth/account', { method: 'DELETE' });
      if (!response.ok) throw new Error('Unable to delete your account. Please try again.');
      await signOut(firebaseAuth);
      toast.success('Your account was deleted.');
      router.replace('/'); router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to delete your account. Please try again.';
      setError(message); toast.error(message); setPending(false);
    } finally {
      progress.done();
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" />}><Trash2 />Delete account</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive"><Trash2 /></AlertDialogMedia>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone. Your {appName} account and user profile will be permanently deleted.</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} onClick={deleteAccount}>{pending ? 'Deleting…' : 'Delete account'}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

'use client';

import type { FormEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut, type User } from 'firebase/auth';
import { ArrowRight, LoaderCircle, LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGlobalProgress } from '@/components/global-progress';
import { firebaseAuth, firebaseAuthReady } from '@/lib/firebase/client';

function authMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'An account already exists for this email.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/missing-email': 'Enter your email address.',
    'auth/user-not-found': 'No account was found for this email address.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/user-disabled': 'This account has been suspended. Contact an administrator for help.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled. Contact an administrator for help.',
    'auth/network-request-failed': 'Unable to reach Firebase. Check your connection and try again.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment, then try again.',
    'auth/invalid-api-key': 'Authentication is not configured correctly. Contact an administrator.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Authentication is not configured correctly. Contact an administrator.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow popups and try again.',
    'auth/cancelled-popup-request': 'Another sign-in window was opened. Please try again.',
    'auth/unauthorized-domain': 'This domain is not authorized for sign-in. Contact an administrator.',
    'auth/operation-not-supported-in-this-environment': 'This browser does not support this sign-in method.',
    'auth/web-storage-unsupported': 'Browser storage is unavailable. Enable it and try again.',
    'auth/weak-password': 'Use a password with at least six characters.',
  };
  return messages[error.code] ?? `Unable to authenticate (${error.code}). Please try again.`;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function LoginForm({ appName, mobileBrand, returnTo = '/dashboard' }: { appName: string; mobileBrand: ReactNode; returnTo?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const progress = useGlobalProgress();

  async function createServerSession(user: User) {
    const idToken = await user.getIdToken(true);
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(result.error || 'Unable to create the application session.');
    }
    router.replace(returnTo);
    router.refresh();
  }

  useEffect(() => {
    let active = true;
    void firebaseAuthReady.then(() => {
      if (!active) return;
      return onAuthStateChanged(firebaseAuth, (user) => {
        if (user && !submitting.current) {
          progress.start();
          void createServerSession(user)
            .catch(() => setError('Unable to restore your session. Please sign in again.'))
            .finally(progress.done);
        }
      });
    }).then((unsubscribe) => {
      if (!active) unsubscribe?.();
    });
    return () => { active = false; };
  // Session restoration should only register one Firebase observer on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnTo]);

  async function handleCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = normalizeEmail(email);
    setEmail(normalizedEmail);
    if (!isValidEmail(normalizedEmail)) {
      const message = 'Enter a valid email address, including @ and a domain (for example, you@example.com).';
      setError(message); setMessage(''); toast.error(message);
      return;
    }
    setPending(true); setError(''); setMessage(''); submitting.current = true; progress.start();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    try {
      await firebaseAuthReady;
      const result = mode === 'login'
        ? await signInWithEmailAndPassword(firebaseAuth, normalizedEmail, password)
        : await createUserWithEmailAndPassword(firebaseAuth, normalizedEmail, password);
      if (!result.user.emailVerified) {
        await sendEmailVerification(result.user);
        await signOut(firebaseAuth);
        setMode('login');
        setMessage('Check your inbox, verify your email address, then sign in.');
        toast.success('Verification email sent.');
        setPending(false); submitting.current = false;
        return;
      }
      await createServerSession(result.user);
      toast.success(mode === 'login' ? 'Signed in successfully.' : 'Account created successfully.');
    } catch (caught) {
      const message = authMessage(caught);
      setError(message); toast.error(message); setPending(false); submitting.current = false;
    } finally {
      progress.done();
    }
  }

  async function handleGoogle() {
    setPending(true); setError(''); setMessage(''); submitting.current = true; progress.start();
    try {
      await firebaseAuthReady;
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(firebaseAuth, provider);
      await createServerSession(result.user);
      toast.success('Signed in with Google.');
    } catch (caught) {
      const message = authMessage(caught);
      setError(message); toast.error(message); setPending(false); submitting.current = false;
    } finally {
      progress.done();
    }
  }

  async function handlePasswordReset() {
    setError(''); setMessage('');
    if (!email) { setError('Enter your email address first.'); return; }
    progress.start();
    try {
      await firebaseAuthReady;
      await sendPasswordResetEmail(firebaseAuth, email);
      setMessage('Check your inbox for a password reset link.');
      toast.success('Password reset email sent.');
    } catch (caught) {
      const message = authMessage(caught);
      setError(message); toast.error(message);
    } finally { progress.done(); }
  }

  return (
    <div className="w-full max-w-105">
      <div className="mb-9 lg:hidden">{mobileBrand}</div>
      <div className="mb-8">
        <p className="mb-2 text-sm font-medium text-primary">{mode === 'login' ? 'Welcome back' : `Join ${appName}`}</p>
        <h2 className="text-3xl font-semibold tracking-[-0.035em]">{mode === 'login' ? 'Sign in to your account' : 'Create your account'}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{mode === 'login' ? 'Enter your details below to continue.' : 'Use your email or Google account to get started.'}</p>
      </div>

      <form className="space-y-5" onSubmit={handleCredentials}>
        <div className="space-y-2"><label htmlFor="email" className="text-sm font-medium">Email address</label><Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="h-12 rounded-xl px-4 shadow-xs" required /></div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4"><label htmlFor="password" className="text-sm font-medium">Password</label>{mode === 'login' && <Button type="button" variant="link" className="h-auto p-0" onClick={handlePasswordReset}>Forgot password?</Button>}</div>
          <Input id="password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? 'Enter your password' : 'At least 6 characters'} minLength={6} className="h-12 rounded-xl px-4 shadow-xs" required />
        </div>
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
        <Button type="submit" size="lg" disabled={pending} className="h-12 w-full rounded-xl text-sm">
          {pending ? <LoaderCircle className="animate-spin" /> : <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight data-icon="inline-end" className="ml-1 size-4" /></>}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-4 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" /><span>or continue with</span><div className="h-px flex-1 bg-border" /></div>
      <Button type="button" variant="outline" size="lg" disabled={pending} className="h-12 w-full rounded-xl" onClick={handleGoogle}>
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.4 2.9-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9.1L6.5 14Z"/><path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.7 9.7 0 0 0 3.1 7.5l3.4 2.6A5.9 5.9 0 0 1 12 6.1Z"/></svg>
        Continue with Google
      </Button>

      <p className="mt-7 text-center text-sm text-muted-foreground">{mode === 'login' ? 'New here?' : 'Already have an account?'} <Button type="button" variant="link" className="h-auto p-0" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage(''); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</Button></p>
      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-3.5" />Your information is private and secure.</p>
    </div>
  );
}

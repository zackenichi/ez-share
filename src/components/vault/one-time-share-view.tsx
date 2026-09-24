'use client';

import { useState } from 'react';
import { Copy, Eye, EyeOff, KeyRound, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { decryptOneTimeShare, oneTimeShareKeyId } from '@/lib/vault/client-crypto';

type SharedItem = { kind: 'password'; title: string; username: string; password: string; url: string; notes?: string } | { kind: 'note'; title: string; note: string };

export function OneTimeShareView({ token }: { token: string }) {
  const [item, setItem] = useState<SharedItem | null>(null);
  const [pending, setPending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function copy(value: string, label: string) {
    void navigator.clipboard.writeText(value).then(() => toast.success(`${label} copied.`), () => toast.error(`Unable to copy ${label.toLowerCase()}.`));
  }

  async function reveal() {
    const key = new URLSearchParams(window.location.hash.slice(1)).get('key');
    if (!key) { setUnavailable(true); toast.error('This share link has expired or has already been opened.'); return; }
    setPending(true);
    try {
      const keyId = await oneTimeShareKeyId(key);
      const response = await fetch(`/api/public-shares/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyId }) });
      const result = await response.json() as { error?: string; ciphertext?: string; iv?: string };
      if (!response.ok || !result.ciphertext || !result.iv) throw new Error(result.error || 'Unable to reveal this share.');
      const decrypted = await decryptOneTimeShare<SharedItem>(key, { ciphertext: result.ciphertext, iv: result.iv });
      setItem(decrypted);
      // Avoid Next's router-integrated history API here. A hash change stays
      // entirely in the browser and removes the key without another render.
      window.location.hash = '';
      toast.success('One-time share opened.');
    } catch (error) { setUnavailable(true); toast.error(error instanceof Error ? error.message : 'Unable to reveal this share.'); }
    finally { setPending(false); }
  }

  if (!item) return <Card className="w-full max-w-lg"><CardHeader className="text-center"><div className="mx-auto mb-2 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound /></div><CardTitle>{unavailable ? 'Share link expired' : 'One-time secure share'}</CardTitle><CardDescription>{unavailable ? 'This one-time share has expired or has already been opened.' : 'This encrypted item can only be revealed once. Make sure you are ready to save it.'}</CardDescription></CardHeader><CardContent>{!unavailable && <Button className="w-full" disabled={pending} onClick={reveal}>{pending ? 'Revealing…' : 'Reveal once'}</Button>}</CardContent></Card>;

  return <Card className="w-full max-w-2xl overflow-hidden"><CardHeader><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">{item.kind === 'password' ? <KeyRound /> : <StickyNote />}</div><div><CardTitle>{item.title}</CardTitle><CardDescription>This share has now been consumed.</CardDescription></div></div></CardHeader><CardContent className="grid min-w-0 gap-5">{item.kind === 'password' ? <>{item.url && <div><p className="mb-2 text-sm font-medium">Website</p><div className="flex gap-2"><Input readOnly value={item.url} /><Button type="button" size="icon" variant="outline" aria-label="Copy website" onClick={() => copy(item.url, 'Website')}><Copy /></Button></div></div>}<div><p className="mb-2 text-sm font-medium">Username or email</p><div className="flex gap-2"><Input readOnly value={item.username} /><Button type="button" size="icon" variant="outline" aria-label="Copy username or email" onClick={() => copy(item.username, 'Username')}><Copy /></Button></div></div><div><p className="mb-2 text-sm font-medium">Password</p><div className="flex gap-2"><Input readOnly type={showPassword ? 'text' : 'password'} value={item.password} /><Button type="button" size="icon" variant="outline" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff /> : <Eye />}</Button><Button type="button" size="icon" variant="outline" aria-label="Copy password" onClick={() => copy(item.password, 'Password')}><Copy /></Button></div></div>{item.notes && <div className="min-w-0"><p className="mb-2 text-sm font-medium">Notes</p><div className="relative min-w-0"><Textarea readOnly value={item.notes} className="min-h-32 w-full min-w-0 resize-none pr-12" /><Button type="button" size="icon-sm" variant="outline" className="absolute right-2 top-2 bg-background" aria-label="Copy notes" onClick={() => copy(item.notes || '', 'Notes')}><Copy /></Button></div></div>}</> : <div className="min-w-0"><p className="mb-2 text-sm font-medium">Note</p><div className="relative min-w-0"><Textarea readOnly value={item.note} className="min-h-72 w-full min-w-0 resize-none pr-12" /><Button type="button" size="icon-sm" variant="outline" className="absolute right-2 top-2 bg-background" aria-label="Copy note" onClick={() => copy(item.note, 'Note')}><Copy /></Button></div></div>}</CardContent></Card>;
}

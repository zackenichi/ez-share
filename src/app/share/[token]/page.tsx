import type { Metadata } from 'next';
import { AppMark } from '@/components/app-mark';
import { OneTimeShareView } from '@/components/vault/one-time-share-view';

export const metadata: Metadata = { title: 'Secure share', robots: { index: false, follow: false } };

export default async function SharePage({ params }: PageProps<'/share/[token]'>) {
  const { token } = await params;
  return <main className="flex min-h-svh flex-col bg-muted/30"><header className="border-b bg-background px-6 py-4"><AppMark /></header><div className="grid flex-1 place-items-center px-6 py-12"><OneTimeShareView token={token} /></div></main>;
}

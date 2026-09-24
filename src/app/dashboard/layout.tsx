import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/dashboard/app-shell';
import { getCurrentProfile } from '@/lib/auth/profile';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentProfile();
  if (!user) redirect('/');
  return <AppShell user={user}>{children}</AppShell>;
}

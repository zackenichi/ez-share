import type { Metadata } from 'next';
import { AppMark } from '@/components/app-mark';
import { LoginForm } from '@/components/auth/login-form';
import { ProductPreview } from '@/components/auth/product-preview';
import { appConfig } from '@/config/app';
import { getSessionUser } from '@/lib/firebase/session';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: { absolute: `Sign in | ${appConfig.name}` },
};

export default async function Home({ searchParams }: PageProps<'/'>) {
  const requestedReturnTo = (await searchParams).returnTo;
  const returnTo = typeof requestedReturnTo === 'string' && requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo
    : '/dashboard';
  if (await getSessionUser(true)) redirect(returnTo);
  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1.18fr)_minmax(440px,0.82fr)]">
      <section className="relative hidden min-h-svh overflow-hidden border-r border-violet-100 bg-[#f7f5ff] px-10 py-9 lg:flex lg:flex-col xl:px-16 xl:py-12">
        <div className="absolute -left-28 top-1/3 size-72 rounded-full bg-violet-200/45 blur-3xl" />
        <div className="absolute -right-24 -top-28 size-80 rounded-full bg-orange-100/70 blur-3xl" />
        <div className="relative z-10"><AppMark /></div>
        <div className="relative z-10 my-auto py-12">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.16em] text-primary">{appConfig.eyebrow}</p>
          <h1 className="max-w-2xl text-[clamp(3.25rem,5vw,5.75rem)] font-semibold leading-[0.95] tracking-[-0.065em] text-slate-950">{appConfig.title}</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">{appConfig.description}</p>
          <ProductPreview />
        </div>
        <p className="relative z-10 text-xs text-slate-500">© {new Date().getFullYear()} {appConfig.name}. All rights reserved.</p>
      </section>
      <section className="flex min-h-svh items-center justify-center px-6 py-10 sm:px-12 lg:px-16 xl:px-24">
        <LoginForm appName={appConfig.name} mobileBrand={<AppMark />} returnTo={returnTo} />
      </section>
    </main>
  );
}

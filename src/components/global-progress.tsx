'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { Progress } from '@/components/ui/progress';

const ProgressContext = createContext<{ start: () => void; done: () => void; startNavigation: (href?: string) => void } | null>(null);

export function GlobalProgressBar() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-100" role="status" aria-label="Loading page">
      <Progress value={null} className="gap-0 rounded-none drop-shadow-[0_1px_3px_color-mix(in_oklch,var(--primary),transparent_35%)] **:data-[slot=progress-track]:h-1 **:data-[slot=progress-track]:rounded-none **:data-[slot=progress-track]:bg-primary/20" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function GlobalProgressProvider({ children }: { children: ReactNode }) {
  const [operations, setOperations] = useState(0);
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null);
  const pathname = usePathname();
  const navigationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useCallback(() => setOperations((count) => count + 1), []);
  const done = useCallback(() => setOperations((count) => Math.max(0, count - 1)), []);
  const startNavigation = useCallback((href?: string) => {
    const target = href ? new URL(href, window.location.href).pathname : '__pending__';
    setNavigationTarget(target);
    if (navigationTimeout.current) clearTimeout(navigationTimeout.current);
    navigationTimeout.current = setTimeout(() => setNavigationTarget(null), 15000);
  }, []);
  const value = useMemo(() => ({ start, done, startNavigation }), [start, done, startNavigation]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      if (anchor.dataset.noProgress === 'true') return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (`${destination.pathname}${destination.search}` === `${window.location.pathname}${window.location.search}`) return;
      startNavigation(destination.pathname);
    }
    function handlePopState() { startNavigation(window.location.pathname); }
    document.addEventListener('click', handleClick, true);
    window.addEventListener('popstate', handlePopState);
    return () => {
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('popstate', handlePopState);
      if (navigationTimeout.current) clearTimeout(navigationTimeout.current);
    };
  }, [startNavigation]);

  const navigating = navigationTarget !== null && navigationTarget !== pathname;
  return <ProgressContext.Provider value={value}>{(operations > 0 || navigating) && <GlobalProgressBar />}{children}</ProgressContext.Provider>;
}

export function useGlobalProgress() {
  const context = useContext(ProgressContext);
  if (!context) throw new Error('useGlobalProgress must be used inside GlobalProgressProvider.');
  return context;
}

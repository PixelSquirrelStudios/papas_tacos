'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AccountRefresh({ auto = true }: { auto?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!auto) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [auto, router]);
  return <Button variant="outline" size="icon" aria-label="Refresh Orders" title="Refresh Orders" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
    <RefreshCw aria-hidden="true" className={pending ? 'animate-spin' : ''} />
  </Button>;
}
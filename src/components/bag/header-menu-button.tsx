'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBag } from './bag-provider';

export function HeaderMenuButton({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { selectedEventId } = useBag();
  const eventContext = (pathname === '/menu' && params.has('event'))
    || ((pathname === '/bag' || pathname === '/checkout') && Boolean(selectedEventId));
  if (signedIn && eventContext) return null;
  return <Button asChild className="size-9 p-0 sm:size-11 lg:w-auto lg:px-4"><Link href="/menu" aria-label="The Menu" title="The Menu"><UtensilsCrossed aria-hidden="true" /><span className="hidden lg:inline">The Menu</span></Link></Button>;
}

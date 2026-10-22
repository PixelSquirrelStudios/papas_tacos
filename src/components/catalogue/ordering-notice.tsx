'use client';

import Link from 'next/link';
import { ArrowUpRight, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBag } from '@/components/bag/bag-provider';
import { eventOrderingNotice } from '@/lib/catalogue/format';

export function OrderingNotice({ fullWidth = false }: { fullWidth?: boolean }) {
  const { selectedEvent, selectedEventId, settings, catalogue, ready, stockAvailable } = useBag();
  const notice = selectedEvent ? eventOrderingNotice(selectedEvent, settings) : null;
  const label = !ready ? 'Checking Availability' : !catalogue.available ? 'Ordering Unavailable' : notice?.title || (!stockAvailable ? 'Checking Stock' : selectedEventId ? 'Event Unavailable' : settings?.ordering_status === 'paused' ? 'Orders Paused' : 'Orders Closed');
  return <div role="status" className={`flex flex-col items-stretch ${fullWidth ? 'w-full' : 'w-full sm:w-auto sm:min-w-64'}`}>
    <Button disabled className={`min-h-11 h-auto whitespace-normal py-3 gap-2 disabled:cursor-not-allowed disabled:opacity-55 ${fullWidth ? 'w-full' : ''}`}><ShoppingBag className="size-4 shrink-0" aria-hidden="true" />{label}</Button>
    {!selectedEvent && <Link href="/events" className="mt-3 inline-flex min-h-10 items-center justify-center gap-1.5 border-t border-border px-2 pt-3 text-center text-xs leading-relaxed text-brand-yellow transition-colors hover:text-foreground">Find Out Where Our Food Truck Will Be Next<ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" /></Link>}
  </div>;
}
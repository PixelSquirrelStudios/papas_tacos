import Link from 'next/link';
import { ArrowUpRight, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function OrderingNotice({ fullWidth = false }: { fullWidth?: boolean }) {
  return <div role="status" className={`flex flex-col items-stretch ${fullWidth ? 'w-full' : 'w-full sm:w-auto sm:min-w-64'}`}>
    <Button disabled className={`h-11 gap-2 disabled:cursor-not-allowed disabled:opacity-55 ${fullWidth ? 'w-full' : ''}`}><ShoppingBag className="size-4" aria-hidden="true" />Orders Closed</Button>
    <Link href="/events" className="mt-3 inline-flex min-h-10 items-center justify-center gap-1.5 border-t border-border px-2 pt-3 text-center text-xs leading-relaxed text-brand-yellow transition-colors hover:text-foreground">Find Out Where Our Food Truck Will Be Next<ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" /></Link>
  </div>;
}
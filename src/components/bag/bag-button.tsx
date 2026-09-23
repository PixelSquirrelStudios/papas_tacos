'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBag } from './bag-provider';

export function BagButton() {
  const { lines, orderingOpen } = useBag();
  if (!orderingOpen) return null;
  const count = lines.reduce((total, line) => total + line.quantity, 0);
  return <Button variant="ghost" asChild className="relative size-9 shrink-0 bg-accent p-0 hover:bg-input dark:hover:bg-input sm:size-11"><Link href="/bag" aria-label={`Your bag, ${count} items`} title="Your Bag"><ShoppingBag className="size-5" />{count > 0 && <span aria-hidden="true" className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{count > 99 ? '99+' : count}</span>}</Link></Button>;
}
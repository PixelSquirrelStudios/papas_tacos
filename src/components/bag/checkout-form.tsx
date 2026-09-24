'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ArrowLeft, CreditCard, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useBag } from './bag-provider';
import { money, quoteLine } from '@/lib/bag';
import { startCheckout } from '@/app/(public)/checkout/actions';
import { orderDate } from '@/lib/account/orders';

export type CheckoutSlot = { id: string; starts_at: string; ends_at: string; events: { title: string; venue_name: string } };

export function CheckoutForm({ slots, name, phone, email }: { slots: CheckoutSlot[]; name: string; phone: string; email: string }) {
  const { lines, ready, catalogue, settings, orderingOpen } = useBag();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState<{ serialized: string; key: string } | null>(null);
  const quotes = lines.map((line) => ({ line, quote: quoteLine(line, catalogue.items) }));
  const subtotal = quotes.reduce((total, { quote }) => total + quote.total, 0);
  const total = subtotal + (settings?.service_fee_pence ?? 0) + (settings?.packaging_fee_pence ?? 0);
  const canPay = ready && lines.length > 0 && lines.length <= 50 && catalogue.available && orderingOpen
    && settings?.card_enabled && subtotal >= settings.minimum_order_pence && total >= 30 && quotes.every(({ quote }) => !quote.issue) && slots.length > 0;
  return <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!canPay || pending) return;
      const form = new FormData(event.currentTarget);
      const values = { name: String(form.get('name')), phone: String(form.get('phone')), note: String(form.get('note')), slotId: String(form.get('slotId')), lines, expectedTotal: total };
      const serialized = JSON.stringify(values);
      let saved = attempt;
      try { saved = JSON.parse(sessionStorage.getItem('papas-tacos:checkout') || 'null') ?? saved; } catch {}
      const key = saved?.serialized === serialized ? saved.key : crypto.randomUUID();
      setAttempt({ serialized, key });
      try { sessionStorage.setItem('papas-tacos:checkout', JSON.stringify({ serialized, key })); } catch {}
      setError('');
      startTransition(async () => {
        try {
          const result = await startCheckout({ ...values, key });
          if (result.url) {
            try { sessionStorage.setItem('papas-tacos:checkout', JSON.stringify({ serialized, key, orderId: result.orderId })); } catch {}
            window.location.assign(result.url);
          }
          else setError(result.error || 'Payment is unavailable. Please try again.');
        } catch { setError('Unable to start payment. Check your connection and try again.'); }
      });
    }} className="min-w-0 space-y-6">
      <div><Label htmlFor="checkout-name">Collection Name</Label><Input id="checkout-name" name="name" autoComplete="name" defaultValue={name} required maxLength={120} className="mt-2" disabled={pending} /></div>
      <div><Label htmlFor="checkout-phone">Phone Number</Label><Input id="checkout-phone" name="phone" type="tel" autoComplete="tel" defaultValue={phone} required minLength={3} maxLength={30} className="mt-2" disabled={pending} /></div>
      <div><Label htmlFor="checkout-email">Account Email</Label><Input id="checkout-email" type="email" value={email} readOnly className="mt-2" /></div>
      <div><Label htmlFor="checkout-slot">Pickup Time</Label><select id="checkout-slot" name="slotId" required defaultValue="" disabled={pending} className="mt-2 h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"><option value="" disabled>Choose a pickup time</option>{slots.map((slot) => <option key={slot.id} value={slot.id}>{orderDate(slot.starts_at)} - {slot.events.venue_name}</option>)}</select></div>
      <div><Label htmlFor="checkout-note">Order Note</Label><Textarea id="checkout-note" name="note" maxLength={1000} className="mt-2" disabled={pending} /></div>
      {!canPay && ready && <p role="status" className="border-l-2 border-primary pl-4 text-sm text-muted-foreground">Checkout is unavailable for this bag or pickup schedule. Review your items and the current ordering availability.</p>}
      {error && <p role="alert" className="border-l-2 border-destructive pl-4 text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-12 w-full sm:w-auto" disabled={!canPay || pending}>{pending ? <LoaderCircle className="animate-spin" /> : <CreditCard />}{pending ? 'Opening Payment...' : `Pay ${money(total)}`}</Button>
    </form>
    <aside className="min-w-0 self-start border-t pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"><h2 className="mb-5 text-xl font-semibold">Your Order</h2><ul className="divide-y">{quotes.map(({ line, quote }, index) => <li key={index} className="flex justify-between gap-4 py-3 text-sm"><span className="min-w-0 break-words">{line.quantity} x {quote.item?.name || 'Unavailable Item'}</span><span className="shrink-0 tabular-nums">{money(quote.total)}</span></li>)}</ul><dl className="mt-4 space-y-3 border-t pt-4 text-sm"><div className="flex justify-between"><dt>Service Fee</dt><dd>{money(settings?.service_fee_pence ?? 0)}</dd></div><div className="flex justify-between"><dt>Packaging</dt><dd>{money(settings?.packaging_fee_pence ?? 0)}</dd></div><div className="flex justify-between border-t pt-4 text-lg font-semibold"><dt>Total</dt><dd className="text-brand-yellow">{money(total)}</dd></div></dl><Button asChild variant="outline" className="mt-6"><Link href="/bag"><ArrowLeft />Edit Bag</Link></Button></aside>
  </div>;
}
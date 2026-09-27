'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { ArrowLeft, CreditCard, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useBag } from './bag-provider';
import { money, quoteLine } from '@/lib/bag';
import { startCheckout } from '@/app/(public)/checkout/actions';
import { eventDate, eventTime } from '@/lib/catalogue/format';
import { pickupChoicesSchema, type PickupChoice } from '@/lib/pickup';
import { catalogueUpdateEvent, siteUpdateEvent } from '@/lib/site-updates';

export type CheckoutSlot = PickupChoice;

export function CheckoutForm({ slots, name, phone, email }: { slots: CheckoutSlot[]; name: string; phone: string; email: string }) {
  const { lines, ready, catalogue, settings, orderingOpen } = useBag();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState<{ serialized: string; key: string } | null>(null);
  const [sourceSlots, setSourceSlots] = useState(slots);
  const [choices, setChoices] = useState(slots);
  const [slotError, setSlotError] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState('');
  if (slots !== sourceSlots) { setSourceSlots(slots); setChoices(slots); }
  useEffect(() => {
    const controller = new AbortController();
    let refreshing = false;
    async function refresh() {
      if (refreshing || document.visibilityState === 'hidden') return;
      refreshing = true;
      try {
        const response = await fetch('/api/pickup-slots', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw new Error('Pickup unavailable');
        const data = await response.json();
        const updated = pickupChoicesSchema.parse(data.slots);
        if (!controller.signal.aborted) { setChoices(updated); setSlotError(false); }
      } catch { if (!controller.signal.aborted) setSlotError(true); }
      finally { refreshing = false; }
    }
    const timer = window.setInterval(refresh, 15000);
    for (const event of ['focus', 'online', siteUpdateEvent, catalogueUpdateEvent]) window.addEventListener(event, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort(); window.clearInterval(timer);
      for (const event of ['focus', 'online', siteUpdateEvent, catalogueUpdateEvent]) window.removeEventListener(event, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const quotes = lines.map((line) => ({ line, quote: quoteLine(line, catalogue.items) }));
  const availableSlots = choices.filter((slot) => slot.status === 'available');
  const subtotal = quotes.reduce((total, { quote }) => total + quote.total, 0);
  const total = subtotal + (settings?.service_fee_pence ?? 0) + (settings?.packaging_fee_pence ?? 0);
  const blockedReason = !catalogue.available || !settings ? 'We cannot check checkout availability right now. Please try again.'
    : !lines.length ? 'Your bag is empty.'
    : lines.length > 50 ? 'Checkout supports up to 50 different items. Remove some items from your bag.'
    : quotes.some(({ quote }) => quote.issue) ? 'Some items need attention. Edit your bag to review unavailable items and required choices.'
    : !orderingOpen ? 'Ordering is currently unavailable. Check the current event ordering window.'
    : !settings.card_enabled ? 'Card payments are currently unavailable.'
    : subtotal < settings.minimum_order_pence ? `Add ${money(settings.minimum_order_pence - subtotal)} more to meet the minimum food order.`
    : total < 30 ? 'Card orders must total at least £0.30.'
    : slotError ? 'Pickup availability could not be refreshed. Please try again.'
    : !choices.some((slot) => slot.status === 'available') ? 'No pickup times are currently available for card checkout.'
    : !choices.some((slot) => slot.id === selectedSlot && slot.status === 'available') ? 'Choose an available pickup time.'
    : '';
  const canPay = ready && !blockedReason;
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
      <fieldset disabled={pending} className="min-w-0"><legend className="mb-3 text-sm font-medium">Pickup Time</legend>
        {!availableSlots.length && <p className="text-sm text-muted-foreground">No pickup times are currently available.</p>}
        {[...new Set(availableSlots.map((slot) => `${slot.event_id}:${eventDate(slot.starts_at)}`))].map((key) => {
          const grouped = availableSlots.filter((slot) => `${slot.event_id}:${eventDate(slot.starts_at)}` === key);
          return <div key={key} className="mb-5"><h3 className="mb-1 text-sm font-semibold wrap-anywhere">{grouped[0].event_title} / {grouped[0].venue_name}</h3><p className="mb-3 text-xs text-muted-foreground">{eventDate(grouped[0].starts_at)}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">{grouped.map((slot) => <label key={slot.id} className="relative min-w-0 cursor-pointer">
              <input type="radio" name="slotId" value={slot.id} checked={selectedSlot === slot.id} onChange={() => setSelectedSlot(slot.id)} disabled={slotError} required className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-default" />
              <span className="flex h-12 items-center justify-center rounded-md border border-turquoise/30 px-2 text-sm font-semibold tabular-nums peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-checked:border-turquoise peer-checked:bg-turquoise/15">{eventTime(slot.starts_at)} - {eventTime(slot.ends_at)}</span>
            </label>)}</div>
          </div>;
        })}
      </fieldset>
      <div><Label htmlFor="checkout-note">Order Note</Label><Textarea id="checkout-note" name="note" maxLength={1000} className="mt-2" disabled={pending} /></div>
      {blockedReason && ready && <p role="status" className="border-l-2 border-primary pl-4 text-sm text-muted-foreground">{blockedReason}</p>}
      {error && <p role="alert" className="border-l-2 border-destructive pl-4 text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-12 w-full sm:w-auto" disabled={!canPay || pending}>{pending ? <LoaderCircle className="animate-spin" /> : <CreditCard />}{pending ? 'Opening Payment...' : `Pay ${money(total)}`}</Button>
    </form>
    <aside className="min-w-0 self-start border-t pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"><h2 className="mb-5 text-xl font-semibold">Your Order</h2><ul className="divide-y">{quotes.map(({ line, quote }, index) => <li key={index} className="flex justify-between gap-4 py-3 text-sm"><span className="min-w-0 break-words">{line.quantity} x {quote.item?.name || 'Unavailable Item'}</span><span className="shrink-0 tabular-nums">{money(quote.total)}</span></li>)}</ul><dl className="mt-4 space-y-3 border-t pt-4 text-sm">{(settings?.service_fee_pence ?? 0) > 0 && <div className="flex justify-between"><dt>Service Fee</dt><dd>{money(settings!.service_fee_pence)}</dd></div>}{(settings?.packaging_fee_pence ?? 0) > 0 && <div className="flex justify-between"><dt>Packaging</dt><dd>{money(settings!.packaging_fee_pence)}</dd></div>}<div className="flex justify-between border-t pt-4 text-lg font-semibold"><dt>Total</dt><dd className="text-brand-yellow">{money(total)}</dd></div></dl><Button asChild variant="outline" className="mt-6"><Link href="/bag"><ArrowLeft />Edit Bag</Link></Button></aside>
  </div>;
}
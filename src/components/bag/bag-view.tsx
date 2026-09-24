'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { ArrowRight, CircleAlert, Info, MapPin, Pencil, Plus, ReceiptText, ShoppingBag, Trash2, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FoodBadges } from '@/components/catalogue/food-badges';
import { useBag } from './bag-provider';
import { ItemPicker, QuantityControl } from './item-picker';
import { lineKey, money, quoteLine, type BagLine } from '@/lib/bag';

export function BagView() {
  const { lines, ready, storageError, catalogue, settings, orderingOpen, remove, setQuantity } = useBag();
  const [editing, setEditing] = useState<BagLine | null>(null);
  const quotes = lines.map((line) => ({ line, quote: quoteLine(line, catalogue.items) }));
  const subtotal = quotes.reduce((total, { quote }) => total + quote.total, 0);
  const fees = settings ? settings.service_fee_pence + settings.packaging_fee_pence : 0;
  const itemCount = lines.reduce((total, line) => total + line.quantity, 0);
  const pricesAvailable = catalogue.available && quotes.every(({ line, quote }) => quote.item && quote.options.length === line.optionIds.length);
  const needsReview = catalogue.available && quotes.some(({ quote }) => quote.issue);
  const minimumRemaining = settings && pricesAvailable ? Math.max(0, settings.minimum_order_pence - subtotal) : 0;
  const editedItem = editing ? catalogue.items.find((item) => item.id === editing.itemId) : null;
  if (!ready) return <div role="status" aria-label="Loading Your Bag" className="grid gap-10 py-6 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="space-y-6">{[0, 1].map((index) => <div key={index} className="flex gap-4 border-b pb-6"><Skeleton className="size-24 shrink-0 rounded-lg" /><div className="flex-1 space-y-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-10 w-28" /></div></div>)}</div><Skeleton className="h-64 w-full rounded-lg" /><span className="sr-only">Loading your bag...</span></div>;
  if (lines.length === 0) return <div className="flex flex-col items-center border-y border-border py-14 text-center sm:py-20"><ShoppingBag className="mb-6 size-12 text-pink" strokeWidth={1.3} aria-hidden="true" /><h2 className="text-2xl font-semibold">A little room for tacos.</h2><p className="mt-3 text-muted-foreground">Your bag is empty.</p><Button asChild className="mt-7 h-12"><Link href="/menu"><UtensilsCrossed />Explore the Menu<ArrowRight /></Link></Button></div>;
  return <>
    {storageError && <p role="alert" className="mb-6 border-l-2 border-primary bg-primary/5 p-4 text-sm">Your browser cannot save this bag. Keep this page open to retain your items.</p>}
    {!catalogue.available && <p role="alert" className="mb-6 border-l-2 border-primary bg-primary/5 p-4 text-sm">We cannot check menu prices right now. Your saved items have been kept.</p>}
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
      <section aria-labelledby="bag-items-title" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-5"><h2 id="bag-items-title" className="flex items-center gap-2 text-lg font-semibold"><ShoppingBag className="size-5 text-turquoise" aria-hidden="true" />Your Items<span className="ml-1 text-sm font-normal text-muted-foreground" aria-live="polite">({itemCount})</span></h2><Link href="/menu" className="flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-brand-yellow transition-colors duration-200 hover:bg-white/5"><Plus className="size-4" aria-hidden="true" />Add More</Link></div>
        {quotes.map(({ line, quote }) => <article key={lineKey(line)} className="mt-5 overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-4 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-5">
            <div className="relative aspect-square self-start overflow-hidden rounded-lg border-2 border-brand-yellow bg-muted">{quote.item?.imageUrl ? <Image src={quote.item.imageUrl} alt={quote.item.image_alt || quote.item.name} fill unoptimized sizes="(max-width: 640px) 80px, 120px" className="object-cover" /> : <div className="grid h-full place-items-center"><UtensilsCrossed className="size-8 text-muted-foreground" aria-label="Item Image Unavailable" /></div>}</div>
            <div className="min-w-0"><div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1"><h3 className="min-w-0 break-words text-lg font-semibold leading-snug">{quote.item?.name || 'Saved Menu Item'}</h3><strong className="text-lg tabular-nums">{catalogue.available && quote.item && quote.options.length === line.optionIds.length ? money(quote.total) : '--'}</strong></div>
              {catalogue.available && quote.item && <p className="mt-1 text-xs text-muted-foreground">{money(quote.item.price_pence)} each before extras</p>}
            </div>
            {quote.options.length > 0 && <ul aria-label="Selected Choices" className="col-span-2 grid gap-2 text-sm">{quote.options.map((option) => <li key={option.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-l-2 border-brand-yellow bg-background/60 px-3 py-2.5"><span className="min-w-0 break-words"><span className="font-semibold text-brand-yellow">{quote.item?.groups.find((group) => group.id === option.modifier_group_id)?.name.replace(/ filling$/i, '') ?? 'Extra'}:</span> {option.name}</span>{option.price_pence > 0 && <span className="text-muted-foreground tabular-nums">+{money(option.price_pence)} each</span>}</li>)}</ul>}
            {quote.item && <div className="col-span-2"><FoodBadges grouped category={catalogue.categories.find((category) => category.id === quote.item?.category_id)?.name} dietary={quote.item.dietary_tags} allergens={[...new Set([...quote.item.allergens, ...quote.options.flatMap((option) => option.allergens)])]} /></div>}
          </div>
          {catalogue.available && quote.issue && <p role="status" className="mt-4 flex items-start gap-2 border-l-2 border-primary bg-primary/5 p-3 text-sm"><CircleAlert className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{quote.issue}</p>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><QuantityControl value={line.quantity} onChange={(quantity) => setQuantity(lineKey(line), quantity)} label={quote.item?.name || 'item'} /><div className="flex items-center gap-2"><Button variant="ghost" className="h-11 bg-accent/50 px-2 duration-200 hover:bg-accent/70 hover:text-foreground dark:hover:bg-accent/70 sm:px-3" aria-label={`Edit ${quote.item?.name || 'item'}`} disabled={!quote.item || !catalogue.available} onClick={() => setEditing(line)}><Pencil className="size-4" />Edit</Button><Button variant="ghost" size="icon" className="size-11 bg-accent/50 text-muted-foreground hover:text-destructive" aria-label={`Remove ${quote.item?.name || 'item'}`} title="Remove Item" onClick={() => remove(lineKey(line))}><Trash2 className="size-4" /></Button></div></div>
        </article>)}
      </section>
      <aside aria-labelledby="bag-summary-title" className="min-w-0 self-start border-t border-border pt-6 lg:sticky lg:top-[121px] lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
        <h2 id="bag-summary-title" className="mb-6 flex items-center gap-2 text-xl font-semibold"><ReceiptText className="size-5 text-turquoise" aria-hidden="true" />Order Summary</h2>
        <div className="mb-6 flex items-start gap-3 border-y py-4"><MapPin className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Collection from the Truck</p><Link href="/events" className="mt-1 inline-flex min-h-9 items-center gap-1 text-sm text-brand-yellow">Find the Truck<ArrowRight className="size-3.5" aria-hidden="true" /></Link></div></div>
        <dl className="space-y-4 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Items and Extras</dt><dd className="font-medium tabular-nums">{pricesAvailable ? money(subtotal) : '--'}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Service Fee</dt><dd className="tabular-nums">{settings ? money(settings.service_fee_pence) : '--'}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Packaging</dt><dd className="tabular-nums">{settings ? money(settings.packaging_fee_pence) : '--'}</dd></div><div className="flex flex-wrap justify-between gap-3 border-t border-border pt-5 text-lg font-semibold"><dt>Estimated Total</dt><dd className="text-2xl text-brand-yellow tabular-nums">{pricesAvailable && settings ? money(subtotal + fees) : '--'}</dd></div></dl>
        {minimumRemaining > 0 && <p className="mt-4 flex items-start gap-2 rounded-md border border-brand-yellow/25 bg-brand-yellow/5 p-3 text-sm text-brand-yellow"><Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>Add {money(minimumRemaining)} more to reach the {money(settings!.minimum_order_pence)} minimum food order.</span></p>}
        {needsReview && <p role="status" className="mt-4 flex items-start gap-2 rounded-md border border-primary/25 bg-primary/5 p-3 text-sm text-primary"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>Review the highlighted items before ordering.</span></p>}
        {orderingOpen && settings?.card_enabled && pricesAvailable && !needsReview && minimumRemaining === 0 ? <Button asChild className="mt-6 h-12 w-full"><Link href="/checkout"><ShoppingBag />Checkout<ArrowRight /></Link></Button> : <Button disabled className="mt-6 h-12 w-full"><ShoppingBag />Checkout Unavailable</Button>}
        <p className="mt-3 flex items-start gap-2 rounded-md border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground"><CircleAlert className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><span>Food allergy? Speak to our team before ordering. Cross-contamination may occur.</span></p>
      </aside>
    </div>
    {editing && editedItem && <ItemPicker item={editedItem} initial={editing} open onOpenChange={(open) => { if (!open) setEditing(null); }} />}
  </>;
}
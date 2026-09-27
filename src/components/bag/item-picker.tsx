'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CircleAlert, Minus, Plus, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useBag } from './bag-provider';
import { lineKey, money, quoteLine, type BagLine } from '@/lib/bag';
import type { CatalogueItem } from '@/lib/catalogue/types';
import { FoodBadges } from '@/components/catalogue/food-badges';
import { Badge } from '@/components/ui/badge';
import { ExpandableDescription, RichDescription } from '@/components/catalogue/rich-description';
import { OrderingNotice } from '@/components/catalogue/ordering-notice';

export function QuantityControl({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return <div className="inline-flex h-11 shrink-0 items-center rounded-md border border-border bg-muted/50"><Button size="icon" className="size-10 bg-brand-yellow/10 text-brand-yellow hover:bg-brand-yellow/25" disabled={value <= 1} onClick={() => onChange(value - 1)} aria-label={`Decrease ${label}`}><Minus /></Button><output className="w-8 text-center text-sm font-semibold tabular-nums" aria-label={`${label} quantity`}>{value}</output><Button size="icon" className="size-10 bg-brand-yellow/10 text-brand-yellow hover:bg-brand-yellow/25" disabled={value >= 99} onClick={() => onChange(value + 1)} aria-label={`Increase ${label}`}><Plus /></Button></div>;
}

function PickerForm({ item, initial, onDone }: { item: CatalogueItem; initial?: BagLine; onDone: () => void }) {
  const { add, ready, lines, orderingOpen } = useBag();
  const [quantity, setQuantity] = useState(initial?.quantity || 1);
  const [optionIds, setOptionIds] = useState<string[]>(() => (initial?.optionIds || []).filter((id) => item.groups.some((group) => group.options.some((option) => option.id === id && option.is_available))));
  const availableOptionIds = optionIds.filter((id) => item.groups.some((group) => group.options.some((option) => option.id === id && option.is_available)));
  if (availableOptionIds.length !== optionIds.length) setOptionIds(availableOptionIds);
  const line = { itemId: item.id, quantity, optionIds };
  const quote = quoteLine(line, [item]);
  const previewOptions = item.groups.filter((group) => group.max_selections === 1).flatMap((group) => group.options);
  const preview = [...optionIds].reverse().map((id) => previewOptions.find((option) => option.id === id)).find((option) => option?.imageUrl || option?.description);
  const imageUrl = preview?.imageUrl || item.imageUrl;
  const imageAlt = preview?.imageUrl ? preview.image_alt || preview.name : item.image_alt || item.name;
  const bagFull = !initial && lines.length >= 100 && !lines.some((existing) => lineKey(existing) === lineKey(line));
  const allergens = [...new Set([...item.allergens, ...quote.options.flatMap((option) => option.allergens)])];
  const allergenNotice = item.allergen_note?.trim() || (allergens.length ? 'Cross-contamination may occur. Speak to our team about any food allergy before ordering.' : 'Allergen information is awaiting confirmation. Ask the team before ordering; an empty allergen list does not mean allergen-free.');
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex-1 space-y-7 overflow-y-auto px-6 pb-6">
      <div aria-live="polite"><ExpandableDescription key={preview?.id || item.id} description={preview?.description || item.description || 'Make it your own.'} name={preview?.name || item.name} /></div>
      {imageUrl && <div className="relative aspect-[16/9] overflow-hidden rounded-lg"><Image src={imageUrl} alt={imageAlt} fill unoptimized sizes="(max-width: 640px) 100vw, 464px" className="object-contain" /></div>}
      <FoodBadges dietary={item.dietary_tags} />
      {item.groups.map((group) => !group.options.length && !group.min_selections && item.groups.some((child) => child.parentId === group.id) ? <h3 key={group.id} className="break-words border-t border-border pt-5 text-base font-semibold">{group.name}</h3> : <fieldset key={group.id} className={`min-w-0 border-t border-border pt-5 ${group.depth ? 'border-l-2 border-l-turquoise/40 pl-3' : ''}`}><legend className="max-w-full break-words pr-3 text-base font-semibold">{group.name}</legend><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{group.min_selections ? `Choose ${group.min_selections === group.max_selections ? group.min_selections : `${group.min_selections}-${group.max_selections}`}` : `Up to ${group.max_selections}`}</p><Badge variant="outline" className={`rounded-md ${group.min_selections ? 'border-turquoise/30 text-turquoise' : 'text-muted-foreground'}`}>{group.min_selections ? 'Required' : 'Optional'}</Badge></div>
        {group.max_selections === 1 && group.min_selections === 0 && group.options.length > 0 && <label className="mb-2 flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm"><input type="radio" name={group.id} checked={!group.options.some((option) => optionIds.includes(option.id))} className="size-4 shrink-0 accent-primary" onChange={() => setOptionIds((current) => current.filter((id) => !group.options.some((option) => option.id === id)))} />None</label>}
        {group.options.map((option) => {
          const selected = optionIds.includes(option.id);
          const count = group.options.filter((candidate) => optionIds.includes(candidate.id)).length;
          return <div key={option.id} data-sold-out={!option.is_available || undefined} className={`mb-2 min-w-0 rounded-md border text-sm transition-colors ${option.is_available ? 'border-border has-checked:border-turquoise/50 has-checked:bg-turquoise/5 has-disabled:text-muted-foreground' : 'cursor-default border-border bg-muted/40 opacity-50'}`}><label className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-3 has-disabled:cursor-default">
            <input type={group.max_selections === 1 ? 'radio' : 'checkbox'} name={group.id} checked={selected} disabled={!option.is_available || (!selected && count >= group.max_selections && group.max_selections > 1)} className="size-4 shrink-0 accent-primary disabled:cursor-default" onChange={() => setOptionIds((current) => {
              if (selected) return group.max_selections === 1 ? current : current.filter((id) => id !== option.id);
              const retained = group.max_selections === 1 ? current.filter((id) => !group.options.some((candidate) => candidate.id === id)) : current;
              return [...retained, option.id];
            })} />
            {option.imageUrl && <span className="relative size-14 shrink-0 overflow-hidden rounded-md"><Image src={option.imageUrl} alt="" fill unoptimized sizes="56px" className="object-contain" /></span>}
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2"><span className="min-w-0 wrap-anywhere">{option.name}</span>{!option.is_available && <Badge className="rounded-md border-red-700 bg-red-600 font-semibold text-white">Sold Out</Badge>}{option.price_pence > 0 && <span className="ml-auto shrink-0 tabular-nums">+{money(option.price_pence)}</span>}</span>
          </label>{option.description && <RichDescription content={option.description} className="px-3 pb-3 text-sm leading-relaxed text-muted-foreground" />}</div>;
        })}
      </fieldset>)}
      <section className="border-t border-border pt-5"><h3 className="mb-3 text-sm font-semibold">Allergen Information</h3>{allergens.length > 0 && <FoodBadges allergens={allergens} />}<div role="note" aria-label="Allergy notice" className="mt-3 flex items-start gap-2 rounded-md border border-primary/25 bg-primary/5 p-3 text-sm leading-relaxed"><CircleAlert className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><p>{allergenNotice}</p></div></section>
    </div>
    <div className="space-y-3 border-t border-border bg-background p-6">
      {initial && initial.optionIds.some((id) => !item.groups.some((group) => group.options.some((option) => option.id === id && option.is_available))) && <p role="status" className="text-sm text-pink">Unavailable extras have been removed. Review your choices before updating.</p>}
      {quote.issue && <p role="status" className="text-sm text-pink">{quote.issue}</p>}
      {bagFull && <p role="status" className="text-sm text-pink">Your bag has reached its item limit. Remove an item before adding another.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><QuantityControl value={quantity} onChange={setQuantity} label={item.name} /><strong className="text-xl tabular-nums">{money(quote.total)}</strong></div>
      {orderingOpen ? <Button className="h-12 w-full" disabled={Boolean(quote.issue) || !ready || bagFull} onClick={() => { add(line, initial ? lineKey(initial) : undefined); onDone(); }}><ShoppingBag className="size-4" />{initial ? 'Update Bag' : 'Add to Bag'}</Button> : <OrderingNotice fullWidth />}
    </div>
  </div>;
}

export function ItemPicker({ item, initial, open, onOpenChange }: { item: CatalogueItem; initial?: BagLine; open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full gap-0 sm:max-w-lg"><SheetHeader className="p-6 pr-12"><SheetTitle className="text-2xl">{item.name}</SheetTitle><SheetDescription className="sr-only">Make it your own.</SheetDescription></SheetHeader>{open && <PickerForm item={item} initial={initial} onDone={() => onOpenChange(false)} />}</SheetContent></Sheet>;
}
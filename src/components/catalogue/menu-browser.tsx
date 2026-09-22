'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Fragment, useDeferredValue, useState } from 'react';
import { ArrowRight, Plus, RotateCcw, Search, ShoppingBag, Skull, SlidersHorizontal, Star, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterSelect } from '@/components/ui/filter-select';
import { useBag } from '@/components/bag/bag-provider';
import { ItemPicker } from '@/components/bag/item-picker';
import { money, quoteLine } from '@/lib/bag';
import type { Catalogue, CatalogueItem } from '@/lib/catalogue/types';
import { displayOrder, sectionOrder } from '@/lib/catalogue/ordering';
import { choiceLabel } from '@/lib/catalogue/format';
import { Badge } from '@/components/ui/badge';
import { FoodBadges } from './food-badges';
import { ExpandableDescription, RichDescription } from './rich-description';
import { descriptionText } from '@/lib/catalogue/rich-text';

export function MenuBrowser({ initial, featured = false }: { initial: Catalogue; featured?: boolean | 'papas-choice' | 'crowd-favourites' }) {
  const { catalogue, ready, lines } = useBag();
  const source = catalogue.available ? catalogue : initial;
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [category, setCategory] = useState<string[]>([]);
  const [diet, setDiet] = useState<string[]>([]);
  const [selected, setSelected] = useState<CatalogueItem | null>(null);
  const categories = displayOrder(source.categories);
  const items = sectionOrder(source.items, categories, (item) => item.category_id).filter((item) => (!featured || (featured === 'crowd-favourites' ? item.is_crowd_favourite : item.is_featured)) && (!category.length || category.includes(item.category_id)) && (!diet.length || diet.some((tag) => item.dietary_tags.includes(tag))) && `${item.name} ${descriptionText(item.description)}`.toLowerCase().includes(deferredSearch.toLowerCase()));
  const visible = featured ? items.slice(0, 3) : items;
  const bagCount = lines.reduce((total, line) => total + line.quantity, 0);
  const bagQuotes = lines.map((line) => quoteLine(line, catalogue.items));
  const bagPriceAvailable = catalogue.available && bagQuotes.every((quote) => !quote.issue);
  const hasFilters = Boolean(search || category.length || diet.length);
  function resetFilters() { setSearch(''); setCategory([]); setDiet([]); }
  return <div>
    {!featured && <div className="relative z-30 mb-8 grid grid-cols-[minmax(0,85fr)_minmax(0,15fr)] gap-3 border-y border-border py-5">
      <div className="relative min-w-0 basis-56 flex-1"><Search className="absolute left-3 top-3 size-5 text-muted-foreground" aria-hidden="true" /><Input type="search" aria-label="Search Menu" placeholder="Search the Menu" value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 pl-10" /></div>
      <Button className="h-11 min-w-0 px-0" aria-label="Reset Filters" title="Reset Filters" disabled={!hasFilters} onClick={resetFilters}><RotateCcw /><span className="hidden xl:inline">Reset Filters</span></Button>
      <div className="col-span-2 grid min-w-0 grid-cols-2 gap-3">
        <FilterSelect label="Menu Category" placeholder="All Categories" options={categories.map((entry) => ({ value: entry.id, label: entry.name }))} value={category} onChange={setCategory} />
        <FilterSelect label="Dietary Preference" placeholder="All Dietary Options" options={['vegetarian', 'vegan', 'gluten-free', 'dairy-free'].map((value) => ({ value, label: choiceLabel(value) }))} value={diet} onChange={setDiet} />
      </div>
    </div>}
    {!featured && ready && bagCount > 0 && <div className="sticky top-[97px] z-20 mb-6 bg-background py-3"><Link href="/bag" aria-label="View Bag" className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-brand-green-deep bg-brand-green-deep px-4 py-3 text-foreground transition-colors hover:bg-brand-green-deep/90"><span className="flex items-center gap-3"><ShoppingBag className="size-5 shrink-0" aria-hidden="true" /><span><span className="block text-sm font-bold">View Bag</span><span className="block text-xs" aria-live="polite">{bagCount} {bagCount === 1 ? 'Item' : 'Items'}</span></span></span><span className="flex items-center gap-3"><span className="text-right"><span className="block text-sm font-bold tabular-nums">{bagPriceAvailable ? money(bagQuotes.reduce((total, quote) => total + quote.total, 0)) : 'Review Items'}</span>{bagPriceAvailable && <span className="block text-xs">Items Subtotal</span>}</span><ArrowRight className="size-4 shrink-0" aria-hidden="true" /></span></Link></div>}
    {!source.available ? <p role="status" className="border-y border-border py-10 text-muted-foreground">The menu is temporarily unavailable. Please check back shortly.</p> : visible.length === 0 ? <div role="status" className="py-10"><p className="text-muted-foreground">{hasFilters ? 'No dishes match your selection.' : featured ? 'Our next favourites are on their way.' : 'Our menu will be published here soon.'}</p></div> : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((item, index) => <Fragment key={item.id}>
        {!featured && category.length !== 1 && (index === 0 || visible[index - 1].category_id !== item.category_id) && <h2 className="col-span-full border-b border-border pb-3 text-2xl font-semibold">{categories.find((entry) => entry.id === item.category_id)?.name ?? 'Other'}</h2>}
        <article className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-turquoise/50">
          <div className="relative aspect-[4/3] overflow-hidden bg-muted">{item.imageUrl ? <Image src={item.imageUrl} alt={item.image_alt || item.name} fill unoptimized sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-105" /> : <div className="grid h-full place-items-center text-turquoise/60"><UtensilsCrossed className="size-14" strokeWidth={1} aria-label="Dish image unavailable" /></div>}
            {!item.is_available && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 px-3 pt-16"><p className="text-center font-display text-4xl uppercase text-white/85 sm:text-5xl">Sold Out</p></div>}
            <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                {item.is_featured && <Badge className="max-w-full whitespace-normal bg-background px-2 py-1.5 text-brand-yellow"><Skull className="shrink-0" aria-hidden="true" />Papa&apos;s Choice</Badge>}
                {item.is_crowd_favourite && <Badge className="max-w-full whitespace-normal bg-background px-2 py-1.5 text-brand-yellow"><Star className="shrink-0 fill-current" aria-hidden="true" />Crowd Favourites</Badge>}
              </div>
              {categories.find((entry) => entry.id === item.category_id)?.name && <Badge variant="outline" aria-label={`Category: ${categories.find((entry) => entry.id === item.category_id)!.name}`} className="max-w-[45%] shrink-0 whitespace-normal break-words border-border bg-background px-2 py-1.5 text-right"><UtensilsCrossed className="shrink-0" aria-hidden="true" />{categories.find((entry) => entry.id === item.category_id)!.name}</Badge>}
            </div>
          </div>
          <div className="flex flex-1 flex-col p-5">
            <h3 className="break-words text-xl font-semibold leading-snug">{item.name}</h3>
            {featured ? <ExpandableDescription description={item.description} name={item.name} className="mb-4 mt-2" previewLines={4} equalHeight /> : <RichDescription content={item.description} className="mb-4 mt-2 text-sm leading-relaxed text-muted-foreground" />}
            <div className="border-t border-border pt-4"><FoodBadges dietary={item.dietary_tags} allergens={item.allergens} /></div>
            {item.groups.length > 0 && <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground"><SlidersHorizontal className="size-3.5" aria-hidden="true" />Customisable</p>}
            <div className="mt-auto pt-5"><div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><div><p className="text-xs text-muted-foreground">{item.groups.length ? 'From' : 'Price'}</p><p className="text-xl font-semibold tabular-nums">{money(item.price_pence)}</p></div><Button className="h-11 gap-2" aria-label={`Add ${item.name} to Bag`} disabled={!item.is_available || !ready} onClick={() => setSelected(item)}><Plus className="size-4" />Add to Bag</Button></div></div>
          </div>
      </article></Fragment>)}
    </div>}
    {selected && <ItemPicker item={source.items.find((item) => item.id === selected.id) || { ...selected, is_available: false }} open onOpenChange={(open) => { if (!open) setSelected(null); }} />}
  </div>;
}
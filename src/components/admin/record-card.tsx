import Image from 'next/image';
import { CalendarDays, Clock3, Layers3, MapPin, MessageSquareQuote, Package, Settings2, Skull, Star, UtensilsCrossed } from 'lucide-react';
import { resources, type AdminRow } from '@/lib/admin/resources';
import { adminDate } from '@/lib/admin/orders';
import { money } from '@/lib/bag';
import { choiceLabel, publicImageUrl } from '@/lib/catalogue/format';
import { supabaseConfig } from '@/lib/supabase/config';
import { Badge } from '@/components/ui/badge';
import { ExpandableDescription } from '@/components/catalogue/rich-description';
import { FoodBadges } from '@/components/catalogue/food-badges';

const icons = { menu: UtensilsCrossed, categories: Layers3, modifiers: Layers3, options: Package, events: CalendarDays, slots: Clock3, testimonials: MessageSquareQuote, settings: Settings2 };

export function RecordStatus({ row }: { row: AdminRow }) {
  return <div className="flex flex-wrap gap-1.5">
    {row.archived_at ? <Badge variant="outline">Archived</Badge> : 'is_published' in row ? <Badge variant="outline" className={row.is_published ? 'border-turquoise/30 bg-turquoise/10 text-turquoise' : 'bg-muted text-muted-foreground'}>{row.is_published ? 'Published' : 'Draft'}</Badge> : null}
    {'is_available' in row && <Badge variant="outline" className={row.is_available ? '' : 'border-primary/30 bg-primary/10 text-primary'}>{row.is_available ? 'Available' : 'Sold Out'}</Badge>}
    {'is_enabled' in row && <Badge variant="outline" className={row.is_enabled ? 'text-turquoise' : 'text-muted-foreground'}>{row.is_enabled ? 'Enabled' : 'Disabled'}</Badge>}
    {Boolean(row.is_featured) && <Badge variant="outline" className="border-brand-yellow/30 text-brand-yellow">{'category_id' in row ? <Skull className="size-3 shrink-0" aria-hidden="true" /> : <Star className="size-3 shrink-0" aria-hidden="true" />}{'category_id' in row ? "Papa's Choice" : 'Featured'}</Badge>}
    {Boolean(row.is_crowd_favourite) && <Badge variant="outline" className="border-brand-yellow/30 text-brand-yellow"><Star className="size-3 shrink-0 fill-current" aria-hidden="true" />Crowd Favourites</Badge>}
    {row.ordering_status ? <Badge variant="outline" className="capitalize">{String(row.ordering_status)}</Badge> : null}
  </div>;
}

export function RecordCard({ resourceKey, row, references, children }: { resourceKey: string; row: AdminRow; references: Record<string, AdminRow[]>; children: React.ReactNode }) {
  const resource = resources[resourceKey];
  const Icon = icons[resourceKey as keyof typeof icons] ?? Package;
  const path = row.image_path ?? row.featured_image_path;
  const image = publicImageUrl(typeof path === 'string' ? path : null, supabaseConfig()?.url ?? null);
  const media = resourceKey === 'menu' || resourceKey === 'events';
  const label = resourceKey === 'slots' ? adminDate(row.starts_at) : String(row[resource.label]);
  const referenceField = resource.fields.find((field) => field.reference);
  const reference = referenceField?.reference ? references[referenceField.reference]?.find((entry) => entry.id === row[referenceField.key]) : undefined;
  const description = typeof row.body === 'string' ? row.body : typeof row.description === 'string' ? row.description : '';
  const dietary = Array.isArray(row.dietary_tags) ? row.dietary_tags.map(String) : [];
  const allergens = Array.isArray(row.allergens) ? row.allergens.map(String) : [];
  return <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors hover:border-brand-yellow/40">
    {media && <div className="relative aspect-[16/9] overflow-hidden border-b bg-muted/40">{image ? <Image src={image} alt={String(row.image_alt || '')} fill sizes="(min-width: 1536px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" unoptimized className="object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"><Icon className="size-9 opacity-50" strokeWidth={1.2} aria-hidden="true" /><span className="text-xs">No Image</span></div>}{typeof row.price_pence === 'number' && <span className="absolute bottom-3 right-3 rounded-md bg-background/95 px-3 py-1.5 text-sm font-semibold tabular-nums text-brand-yellow">{money(row.price_pence)}</span>}</div>}
    <div className="flex flex-1 flex-col gap-4 p-5">
      <div className="flex items-start gap-3">{!media && (image ? <Image src={image} alt="" width={44} height={44} unoptimized className="size-11 shrink-0 rounded-md object-cover" /> : <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-turquoise/10 text-turquoise"><Icon className="size-5" aria-hidden="true" /></div>)}<div className="min-w-0 flex-1">{reference && <p className="mb-1 truncate text-xs font-medium text-muted-foreground">{String(reference.name ?? reference.title)}</p>}<h2 className="break-words text-lg font-semibold leading-snug">{label}</h2>{row.slug ? <p className="mt-1 truncate text-xs text-muted-foreground">/{String(row.slug)}</p> : null}</div>{!media && typeof row.price_pence === 'number' && <p className="shrink-0 font-semibold tabular-nums text-brand-yellow">{money(row.price_pence)}</p>}</div>
      <RecordStatus row={row} />
      {description && (resourceKey === 'menu' ? <ExpandableDescription description={description} name={label} /> : <p className="line-clamp-3 break-words text-sm leading-relaxed text-muted-foreground">{description}</p>)}
      <div className="mt-auto space-y-2 text-sm text-muted-foreground">
        {resourceKey === 'menu' && (dietary.length > 0 || allergens.length > 0) && <div className="border-t border-border pt-4"><FoodBadges dietary={dietary} allergens={allergens} /></div>}
        {resourceKey === 'events' && <><p className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{adminDate(row.starts_at)}</p><p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{[row.venue_name, row.town].filter(Boolean).join(', ')}</p></>}
        {resourceKey === 'slots' && <><p>Until {adminDate(row.ends_at)}</p><p className="font-medium text-foreground">Capacity: {String(row.capacity)} Orders</p></>}
        {resourceKey === 'modifiers' && <p>{String(row.min_selections)} - {String(row.max_selections)} Choices</p>}
        {resourceKey === 'testimonials' && <div className="flex flex-wrap items-center justify-between gap-2">{row.rating ? <span className="flex items-center gap-1.5 font-medium text-brand-yellow"><Star className="size-4 fill-current" aria-hidden="true" />{String(row.rating)} / 5</span> : null}{row.source_name ? <span>{String(row.source_name)}</span> : null}</div>}
        {resourceKey === 'settings' && <><p>Cash: {row.cash_enabled ? 'Enabled' : 'Disabled'} / Card: {row.card_enabled ? 'Enabled' : 'Disabled'}</p><p>Minimum Order: {money(Number(row.minimum_order_pence ?? 0))}</p><p>Service: {money(Number(row.service_fee_pence ?? 0))} / Packaging: {money(Number(row.packaging_fee_pence ?? 0))}</p></>}
        {resourceKey !== 'menu' && dietary.length > 0 && <p>{dietary.map(choiceLabel).join(' / ')}</p>}
      </div>
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t bg-background/30 px-4 py-3">{children}</footer>
  </article>;
}
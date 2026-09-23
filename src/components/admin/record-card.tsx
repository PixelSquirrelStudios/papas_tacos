import Image from 'next/image';
import { Banknote, CalendarDays, Check, CircleMinus, Clock3, CreditCard, FileText, Layers3, Mail, MapPin, MessageSquareQuote, Package, Power, Settings2, Skull, Star, UtensilsCrossed } from 'lucide-react';
import { resources, type AdminRow } from '@/lib/admin/resources';
import { adminDate } from '@/lib/admin/orders';
import { money } from '@/lib/bag';
import { choiceLabel, publicImageUrl } from '@/lib/catalogue/format';
import { supabaseConfig } from '@/lib/supabase/config';
import { Badge } from '@/components/ui/badge';
import { ExpandableDescription } from '@/components/catalogue/rich-description';
import { FoodBadges } from '@/components/catalogue/food-badges';

const icons = { menu: UtensilsCrossed, categories: Layers3, modifiers: Layers3, options: Package, events: CalendarDays, slots: Clock3, testimonials: MessageSquareQuote, settings: Settings2 };

function SettingsState({ configured, children }: { configured: boolean; children: React.ReactNode }) {
  return <span className={`flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${configured ? 'bg-turquoise/10 text-turquoise' : 'bg-background/70 text-muted-foreground'}`}>{configured ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : <CircleMinus className="size-3.5 shrink-0" aria-hidden="true" />}<span className="min-w-0 truncate">{children}</span></span>;
}

function SettingsMeter({ value, total }: { value: number; total: number }) {
  return <div className="h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-turquoise" style={{ width: `${value / total * 100}%` }} /></div>;
}

function SettingsSummary({ row }: { row: AdminRow }) {
  const ordering = String(row.ordering_status ?? 'closed');
  const orderingOpen = ordering === 'open';
  const pageImages = [row.about_page_image_1_path, row.about_page_image_2_path, row.about_page_image_3_path].filter(Boolean).length;
  const contact = [row.contact_email, row.contact_phone].filter(Boolean).length;
  const socials = [row.instagram_url, row.facebook_url].filter(Boolean).length;
  const aboutReady = [row.about_content, row.about_full_story, row.about_image_path, ...[row.about_page_image_1_path, row.about_page_image_2_path, row.about_page_image_3_path]].filter(Boolean).length;
  return <div className="space-y-6">
    <section aria-label="Ordering Overview" className={`flex flex-col gap-5 border-l-4 p-5 sm:flex-row sm:items-center sm:justify-between ${orderingOpen ? 'border-turquoise bg-turquoise/8' : 'border-primary bg-primary/8'}`}>
      <div className="flex min-w-0 items-center gap-4"><span className={`grid size-12 shrink-0 place-items-center rounded-full ${orderingOpen ? 'bg-turquoise/15 text-turquoise' : 'bg-primary/15 text-primary'}`}><Power className="size-6" aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase text-muted-foreground">Online Ordering</p><p className={`mt-1 text-2xl font-semibold ${orderingOpen ? 'text-turquoise' : 'text-primary'}`}>{ordering === 'open' ? 'Open for Orders' : ordering === 'paused' ? 'Orders Paused' : 'Orders Closed'}</p></div></div>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{String(row.ordering_message || (orderingOpen ? 'Customers can order from eligible open events.' : 'Ordering controls are closed across the site.'))}</p>
    </section>
    <section aria-label="Payments and Charges">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CreditCard className="size-4 text-turquoise" aria-hidden="true" />Payments &amp; Charges</h3>
      <div className="grid grid-cols-2 divide-x divide-y divide-border border-y border-border sm:grid-cols-5 sm:divide-y-0">
        <div className="flex min-h-20 items-center gap-3 px-3 py-4"><Banknote className={`size-5 shrink-0 ${row.cash_enabled ? 'text-turquoise' : 'text-muted-foreground'}`} aria-hidden="true" /><div><p className="text-xs text-muted-foreground">Cash</p><p className="mt-1 text-sm font-semibold">{row.cash_enabled ? 'Enabled' : 'Disabled'}</p></div></div>
        <div className="flex min-h-20 items-center gap-3 px-3 py-4"><CreditCard className={`size-5 shrink-0 ${row.card_enabled ? 'text-turquoise' : 'text-muted-foreground'}`} aria-hidden="true" /><div><p className="text-xs text-muted-foreground">Card</p><p className="mt-1 text-sm font-semibold">{row.card_enabled ? 'Enabled' : 'Disabled'}</p></div></div>
        {[['Minimum', row.minimum_order_pence], ['Service Fee', row.service_fee_pence], ['Packaging', row.packaging_fee_pence]].map(([label, value]) => <div key={String(label)} className="min-h-20 px-3 py-4 text-center"><p className="text-xs text-muted-foreground">{String(label)}</p><p className="mt-2 text-lg font-semibold tabular-nums text-turquoise">{money(Number(value ?? 0))}</p></div>)}
      </div>
    </section>
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-label="Contact and Social" className="border-t border-border pt-4">
        <div className="mb-4 flex items-end justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><Mail className="size-4 text-turquoise" aria-hidden="true" />Contact &amp; Social</h3><p className="mt-1 text-xs text-muted-foreground">{contact}/2 contact methods and {socials}/2 social profiles configured</p></div><span className="text-2xl font-semibold tabular-nums text-turquoise">{contact + socials}<span className="text-sm text-muted-foreground">/4</span></span></div>
        <SettingsMeter value={contact + socials} total={4} />
        <div className="mt-4 grid gap-2 sm:grid-cols-2"><SettingsState configured={Boolean(row.contact_email)}>{row.contact_email ? String(row.contact_email) : 'Email Missing'}</SettingsState><SettingsState configured={Boolean(row.contact_phone)}>{row.contact_phone ? String(row.contact_phone) : 'Phone Missing'}</SettingsState><SettingsState configured={Boolean(row.instagram_url)}>Instagram</SettingsState><SettingsState configured={Boolean(row.facebook_url)}>Facebook</SettingsState></div>
      </section>
      <section aria-label="About Content" className="border-t border-border pt-4">
        <div className="mb-4 flex items-end justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4 text-turquoise" aria-hidden="true" />About Content</h3><p className="mt-1 text-xs text-muted-foreground">Homepage and full story readiness</p></div><span className="text-2xl font-semibold tabular-nums text-turquoise">{aboutReady}<span className="text-sm text-muted-foreground">/6</span></span></div>
        <SettingsMeter value={aboutReady} total={6} />
        <div className="mt-4 grid gap-2 sm:grid-cols-2"><SettingsState configured={Boolean(row.about_content)}>Homepage Summary</SettingsState><SettingsState configured={Boolean(row.about_full_story)}>Full Story</SettingsState><SettingsState configured={Boolean(row.about_image_path)}>Homepage Image</SettingsState><SettingsState configured={pageImages === 3}>{pageImages}/3 Page Images</SettingsState></div>
      </section>
    </div>
  </div>;
}

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
  return <article className={`flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors ${resourceKey === 'settings' ? 'hover:border-turquoise/40' : 'hover:border-brand-yellow/40'}`}>
    {media && <div className="relative aspect-video overflow-hidden border-b bg-muted/40">{image ? <Image src={image} alt={String(row.image_alt || '')} fill sizes="(min-width: 1536px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" unoptimized className="object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"><Icon className="size-9 opacity-50" strokeWidth={1.2} aria-hidden="true" /><span className="text-xs">No Image</span></div>}{typeof row.price_pence === 'number' && <span className="absolute bottom-3 right-3 rounded-md bg-background/95 px-3 py-1.5 text-sm font-semibold tabular-nums text-brand-yellow">{money(row.price_pence)}</span>}</div>}
    <div className="flex flex-1 flex-col gap-4 p-5">
      <div className="flex items-start gap-3">{!media && (image ? <Image src={image} alt="" width={44} height={44} unoptimized className="size-11 shrink-0 rounded-md object-cover" /> : <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-turquoise/10 text-turquoise"><Icon className="size-5" aria-hidden="true" /></div>)}<div className="min-w-0 flex-1">{reference && <p className="mb-1 truncate text-xs font-medium text-muted-foreground">{String(reference.name ?? reference.title)}</p>}<h2 className="wrap-break-word text-lg font-semibold leading-snug">{label}</h2>{row.slug ? <p className="mt-1 truncate text-xs text-muted-foreground">/{String(row.slug)}</p> : null}</div>{!media && typeof row.price_pence === 'number' && <p className="shrink-0 font-semibold tabular-nums text-brand-yellow">{money(row.price_pence)}</p>}</div>
      {resourceKey !== 'settings' && <RecordStatus row={row} />}
      {description && (resourceKey === 'menu' ? <ExpandableDescription description={description} name={label} /> : <p className="line-clamp-3 wrap-break-word text-sm leading-relaxed text-muted-foreground">{description}</p>)}
      <div className="mt-auto space-y-2 text-sm text-muted-foreground">
        {resourceKey === 'menu' && (dietary.length > 0 || allergens.length > 0) && <div className="border-t border-border pt-4"><FoodBadges dietary={dietary} allergens={allergens} /></div>}
        {resourceKey === 'events' && <><p className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{adminDate(row.starts_at)}</p><p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{[row.venue_name, row.town].filter(Boolean).join(', ')}</p></>}
        {resourceKey === 'slots' && <><p>Until {adminDate(row.ends_at)}</p><p className="font-medium text-foreground">Capacity: {String(row.capacity)} Orders</p></>}
        {resourceKey === 'modifiers' && <p>{String(row.min_selections)} - {String(row.max_selections)} Choices</p>}
        {resourceKey === 'testimonials' && <div className="flex flex-wrap items-center justify-between gap-2">{row.rating ? <span className="flex items-center gap-1.5 font-medium text-brand-yellow"><Star className="size-4 fill-current" aria-hidden="true" />{String(row.rating)} / 5</span> : null}{row.source_name ? <span>{String(row.source_name)}</span> : null}</div>}
        {resourceKey === 'settings' && <SettingsSummary row={row} />}
        {resourceKey !== 'menu' && dietary.length > 0 && <p>{dietary.map(choiceLabel).join(' / ')}</p>}
      </div>
    </div>
    <footer className={`flex flex-wrap items-center justify-between gap-2 border-t bg-background/30 ${resourceKey === 'settings' ? 'p-4' : 'px-4 py-3'}`}>{children}</footer>
  </article>;
}
import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { supabaseConfig } from '@/lib/supabase/config';
import { publicImageUrl } from './format';
import { sectionOrder } from './ordering';
import { expandModifierGroups } from './modifiers';
import { resolveLinkedItems } from './linked-items';
import { menuSetSchema, menuSectionSchema, menuEntrySchema } from './menu-sets';
import { associationSchema, categorySchema, eventSchema, groupSchema, itemSchema, optionSchema, settingsSchema, testimonialSchema, type Catalogue, type Settings, type TruckEvent } from './types';

async function publicRows<Schema extends z.ZodType>(table: string, schema: Schema, filters: Record<string, string> = {}): Promise<z.output<Schema>[] | null> {
  const config = supabaseConfig();
  if (!config) return null;
  try {
    const rows: z.output<Schema>[] = [];
    for (let offset = 0; offset < 10000; offset += 500) {
      const url = new URL(`/rest/v1/${table}`, config.url);
      url.search = new URLSearchParams({ select: '*', ...filters, limit: '500', offset: String(offset) }).toString();
      const response = await fetch(url, { headers: { apikey: config.key }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      const batch = z.array(schema).safeParse(await response.json());
      if (!batch.success) return null;
      rows.push(...batch.data);
      if (batch.data.length < 500) return rows;
    }
    return null;
  } catch { return null; }
}

export function publicImage(path: string | null) {
  const config = supabaseConfig();
  return publicImageUrl(path, config?.url ?? null);
}

export const getCatalogue = cache(async (): Promise<Catalogue> => {
  const [categories, items, groups, options, associations, sets, sections, entries] = await Promise.all([
    publicRows('menu_categories', categorySchema, { is_published: 'eq.true', order: 'sort_order.asc,id.asc' }),
    publicRows('menu_items', itemSchema, { is_published: 'eq.true', archived_at: 'is.null', order: 'sort_order.asc,id.asc' }),
    publicRows('modifier_groups', groupSchema, { is_published: 'eq.true', order: 'id.asc' }),
    publicRows('modifier_options', optionSchema, { order: 'sort_order.asc,id.asc' }),
    publicRows('menu_item_modifier_groups', associationSchema, { order: 'sort_order.asc,menu_item_id.asc,modifier_group_id.asc' }),
    publicRows('menu_sets', menuSetSchema, { order: 'id.asc' }),
    publicRows('menu_set_sections', menuSectionSchema, { order: 'id.asc' }),
    publicRows('menu_set_items', menuEntrySchema, { order: 'menu_set_id.asc,menu_item_id.asc' }),
  ]);
  if (!categories || !items || !groups || !options || !associations || !sets || !sections || !entries || !sets.some((set) => set.is_default)) {
    console.error('[catalogue] Menu data unavailable; verify database upgrades through 054_removal_modifiers.sql');
    return { categories: [], items: [], available: false };
  }
  const modifierGroups = groups.map((group) => ({ ...group, options: options.filter((option) => option.modifier_group_id === group.id).map((option) => ({ ...option, imageUrl: publicImage(option.image_path) })) }));
  try {
  return { categories, available: true, menuSets: { sets, sections, entries }, items: resolveLinkedItems(sectionOrder(items, categories, (item) => item.category_id).filter((item) => categories.some((category) => category.id === item.category_id)).map((item) => ({
    ...item, imageUrl: publicImage(item.image_path),
    groups: expandModifierGroups(associations.filter((association) => association.menu_item_id === item.id).map((association) => association.modifier_group_id), modifierGroups),
  }))) };
  } catch (error) { console.error('[catalogue] Linked menu choices could not be resolved', error); return { categories: [], items: [], available: false }; }
});

export const getSettings = cache(async (): Promise<Settings | null> => {
  const settings = await publicRows('business_settings', settingsSchema, { select: Object.keys(settingsSchema.shape).join(',') });
  return settings?.[0] || null;
});

export async function getMaintenanceMode(): Promise<boolean | null> {
  const settings = await publicRows('business_settings', settingsSchema.pick({ maintenance_enabled: true }), { select: 'maintenance_enabled' });
  return settings?.[0]?.maintenance_enabled ?? null;
}

export const getEvents = cache(async (): Promise<{ events: TruckEvent[]; available: boolean }> => {
  const now = new Date().toISOString();
  const events = await publicRows('events', eventSchema, { is_published: 'eq.true', or: `(ends_at.gt.${now},orders_close_at.gt.${now})`, order: 'starts_at.asc,id.asc' });
  return { events: (events || []).map((event) => ({ ...event, imageUrl: publicImage(event.featured_image_path) })), available: events !== null };
});

export const getTestimonials = cache(async () => {
  const reviews = await publicRows('testimonials', testimonialSchema, { is_published: 'eq.true', order: 'sort_order.asc,id.asc' });
  return { reviews: (reviews || []).map((review) => ({ ...review, imageUrl: publicImage(review.image_path) })), available: reviews !== null };
});

export const getEvent = cache(async (slug: string): Promise<TruckEvent | null> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const events = await publicRows('events', eventSchema, { is_published: 'eq.true', slug: `eq.${slug}`, starts_at: 'not.is.null', ends_at: 'not.is.null' });
  if (events === null) throw new Error('Event information is unavailable.');
  return events[0] ? { ...events[0], imageUrl: publicImage(events[0].featured_image_path) } : null;
});
import { z } from 'zod';
import type { Catalogue } from './types.ts';

export const menuSetSchema = z.object({ id: z.guid(), name: z.string(), is_default: z.boolean(), updated_at: z.string() });
export const menuSectionSchema = z.object({ id: z.guid(), menu_set_id: z.guid(), title: z.string(), sort_order: z.number() });
export const menuEntrySchema = z.object({ menu_set_id: z.guid(), section_id: z.guid(), menu_item_id: z.guid(), sort_order: z.number(), price_pence: z.number().int().nullable() });
export type MenuSet = z.infer<typeof menuSetSchema>;
export type MenuSection = z.infer<typeof menuSectionSchema>;
export type MenuEntry = z.infer<typeof menuEntrySchema>;
export type MenuSets = { sets: MenuSet[]; sections: MenuSection[]; entries: MenuEntry[] };

export function menuCatalogue(source: Catalogue, menuSetId?: string | null): Catalogue {
  if (!source.menuSets) return source;
  const { sets, sections, entries } = source.menuSets;
  const set = menuSetId ? sets.find((set) => set.id === menuSetId) : sets.find((set) => set.is_default);
  if (!set) return { ...source, categories: [], items: [], available: false };
  const orderedSections = sections.filter((section) => section.menu_set_id === set.id).sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const itemsById = new Map(source.items.map((item) => [item.id, item]));
  const items = orderedSections.flatMap((section) => entries.filter((entry) => entry.menu_set_id === set.id && entry.section_id === section.id)
    .sort((a, b) => a.sort_order - b.sort_order || a.menu_item_id.localeCompare(b.menu_item_id))
    .flatMap((entry) => {
      const item = itemsById.get(entry.menu_item_id);
      return item ? [{ ...item, category_id: section.id, sort_order: entry.sort_order, price_pence: entry.price_pence ?? item.price_pence }] : [];
    }));
  return {
    ...source, items,
    categories: orderedSections.map((section) => ({ id: section.id, name: section.title, slug: section.id, sort_order: section.sort_order })),
  };
}

export const menuSetInputSchema = z.object({
  id: z.guid().nullable(), updatedAt: z.iso.datetime({ offset: true }).nullable(),
  name: z.string().trim().min(1).max(120),
  sections: z.array(z.object({
    title: z.string().trim().min(1).max(120),
    items: z.array(z.object({ itemId: z.guid(), pricePence: z.number().int().min(0).max(100000).nullable() })).max(500),
  })).max(50),
}).superRefine((value, context) => {
  const ids = value.sections.flatMap((section) => section.items.map((item) => item.itemId));
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'Each item can appear only once in a menu set.' });
  if (value.id && !value.updatedAt) context.addIssue({ code: 'custom', message: 'Refresh to load the current menu set version.' });
});

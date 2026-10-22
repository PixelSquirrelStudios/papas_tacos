import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { adminRows, adminError } from '@/lib/admin/data';
import { MenuSetEditor } from '@/components/admin/menu-set-editor';
import { menuSetSchema, menuSectionSchema, menuEntrySchema } from '@/lib/catalogue/menu-sets';

export default async function MenuSetPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (id !== 'new' && !z.guid().safeParse(id).success) notFound();
  let data;
  try {
    const [sets, sections, entries, items, categories] = await Promise.all([
      adminRows('menu_sets', { id: id === 'new' ? 'is.null' : `eq.${id}` }),
      id === 'new' ? [] : adminRows('menu_set_sections', { menu_set_id: `eq.${id}`, order: 'sort_order.asc,id.asc' }),
      id === 'new' ? [] : adminRows('menu_set_items', { menu_set_id: `eq.${id}`, order: 'sort_order.asc,menu_item_id.asc' }),
      adminRows('menu_items', { archived_at: 'is.null', order: 'sort_order.asc,id.asc' }),
      adminRows('menu_categories', { order: 'sort_order.asc,id.asc' }),
    ]);
    data = { set: sets[0] ? menuSetSchema.parse(sets[0]) : null, sections: z.array(menuSectionSchema).parse(sections), entries: z.array(menuEntrySchema).parse(entries), items, categories };
  } catch (error) {
    return <main className="p-8"><h1 className="text-2xl font-semibold">Menu Set</h1><p role="alert" className="mt-6 text-destructive">{adminError(error)}</p></main>;
  }
  if (id !== 'new' && !data.set) notFound();
  return <MenuSetEditor key={`${id}:${data.set?.updated_at}`} {...data} />;
}

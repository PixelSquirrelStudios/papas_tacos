import { requireAdmin } from '@/lib/auth/session';
import { adminError, adminRows, AdminDataError } from '@/lib/admin/data';
import type { AdminRow } from '@/lib/admin/resources';
import { HomepageFeaturedMenu, type HomepageMenuItem } from '@/components/admin/homepage-featured-menu';
import { z } from 'zod';

const itemIds = z.array(z.guid()).max(3);

export default async function HomepageMenuPage() {
  await requireAdmin();
  let settings: AdminRow | undefined;
  let items: HomepageMenuItem[] = [];
  let papasChoiceIds: string[] = [];
  let crowdFavouriteIds: string[] = [];
  let updatedAt = '';
  let error = '';
  try {
    const [settingsRows, menuItems, categories] = await Promise.all([
      adminRows('business_settings', { select: 'homepage_papas_choice_ids,homepage_crowd_favourite_ids,updated_at', order: 'singleton.asc' }),
      adminRows('menu_items', { select: 'id,name,category_id,is_published,is_available,archived_at', order: 'name.asc,id.asc' }),
      adminRows('menu_categories', { select: 'id,name', is_published: 'eq.true' }),
    ]);
    settings = settingsRows[0];
    if (!settings?.updated_at) throw new Error('Site settings could not be loaded.');
    const version = z.iso.datetime({ offset: true }).safeParse(settings.updated_at);
    if (!version.success) throw new AdminDataError('DATA', 'Site settings version is invalid. Refresh or contact support.');
    updatedAt = version.data;
    const papasIds = itemIds.safeParse(settings.homepage_papas_choice_ids);
    const crowdIds = itemIds.safeParse(settings.homepage_crowd_favourite_ids);
    if (!papasIds.success || !crowdIds.success) throw new AdminDataError('DATA', 'Stored homepage menu selections are invalid. Refresh or contact support.');
    papasChoiceIds = papasIds.data;
    crowdFavouriteIds = crowdIds.data;
    const categoryById = new Map(categories.map((category) => [String(category.id), String(category.name)]));
    items = menuItems.map((item) => ({
      id: String(item.id),
      name: String(item.name),
      section: categoryById.get(String(item.category_id)) ?? 'Menu Item',
      eligible: item.is_published === true && !item.archived_at && categoryById.has(String(item.category_id)),
      available: item.is_available === true,
    }));
  } catch (failure) { error = adminError(failure); }

  if (error || !settings) return <main className="p-8"><h1 className="text-3xl font-semibold">Homepage Featured Menu</h1><p role="alert" className="mt-5 text-destructive">{error || 'Homepage menu settings are unavailable.'}</p></main>;
  return <HomepageFeaturedMenu
    items={items}
    papasChoiceIds={papasChoiceIds}
    crowdFavouriteIds={crowdFavouriteIds}
    updatedAt={updatedAt}
  />;
}

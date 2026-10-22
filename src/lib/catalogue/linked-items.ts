import type { CatalogueItem } from './types.ts';

export function resolveLinkedItems(items: CatalogueItem[]): CatalogueItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return items.map((item) => ({
    ...item,
    groups: item.groups.map((group) => ({
      ...group,
      options: group.options.map((option) => {
        if (!option.linked_menu_item_id) return option;
        const linked = byId.get(option.linked_menu_item_id);
        const valid = linked && linked.id !== item.id && linked.item_kind !== 'group' && linked.groups.length === 0;
        if (!valid) return { ...option, is_available: false, stock_quantity: 0 };
        return {
          ...option, name: linked.name, description: linked.description,
          image_path: linked.image_path, image_alt: linked.image_alt, imageUrl: linked.imageUrl,
          allergens: linked.allergens, stock_quantity: linked.stock_quantity ?? null,
          price_pence: option.pricing_mode === 'item' ? linked.price_pence * (option.linked_quantity ?? 1) : option.price_pence,
          is_available: option.is_available && linked.is_available,
        };
      }),
    })),
  }));
}

export function hasRequiredChoices(item: CatalogueItem): boolean {
  if (item.item_kind === 'group' && (!item.groups.some((group) => group.min_selections > 0)
    || !item.groups.some((group) => group.options.some((option) => option.linked_menu_item_id && option.is_available)))) return false;
  return item.groups.every((group) => group.options.filter((option) => option.is_available).length >= group.min_selections);
}

export function minimumItemPrice(item: CatalogueItem): number {
  return item.price_pence + item.groups.reduce((total, group) => total + group.options
    .filter((option) => option.is_available).map((option) => option.price_pence).sort((a, b) => a - b)
    .slice(0, group.min_selections).reduce((sum, price) => sum + price, 0), 0);
}

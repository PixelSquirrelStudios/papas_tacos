import { z } from 'zod';
import type { BagLine } from './bag.ts';
import type { Catalogue, CatalogueItem } from './catalogue/types.ts';
import { hasRequiredChoices } from './catalogue/linked-items.ts';

export const trackingModeSchema = z.enum(['none', 'global', 'event']);
export const stockQuantitySchema = z.number().int().min(0).max(1000000);
export const inventoryItemSchema = z.object({
  menu_item_id: z.guid(), tracking_mode: trackingModeSchema, unit_label: z.string(),
  on_hand: stockQuantitySchema, version: z.number().int().nonnegative(),
});
export const allocationSchema = z.object({
  menu_item_id: z.guid(), event_id: z.guid(), remaining: stockQuantitySchema,
  version: z.number().int().nonnegative(),
});
export const orderStockSchema = z.object({
  order_id: z.guid(), menu_item_id: z.guid(), event_id: z.guid(),
  quantity: stockQuantitySchema, state: z.enum(['held', 'sold', 'released', 'restocked']),
  expires_at: z.string().nullable(),
});
export const movementSchema = z.object({
  id: z.string(), menu_item_id: z.guid(), event_id: z.guid().nullable(),
  order_id: z.guid().nullable(), action: z.string(), quantity: z.number().int(),
  reason: z.string().nullable(), created_at: z.string(),
});
export const inventorySaleSchema = z.object({
  menu_item_id: z.guid(), event_id: z.guid(), sold_quantity: z.number().int().nonnegative(),
});
export const publicStockSchema = z.array(z.object({
  menu_item_id: z.guid(), tracking_mode: trackingModeSchema,
  available_quantity: stockQuantitySchema.nullable(),
}));
export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type StockAllocation = z.infer<typeof allocationSchema>;
export type OrderStock = z.infer<typeof orderStockSchema>;
export type StockMovement = z.infer<typeof movementSchema>;
export type InventorySale = z.infer<typeof inventorySaleSchema>;
export type PublicStock = z.infer<typeof publicStockSchema>;

export const trackingLabels = {
  none: 'Not Tracked',
  global: 'Global Stock + Event Allocations',
  event: 'Event Portions Only',
};

export const inventoryActionSchema = z.object({
  itemId: z.guid(), eventId: z.guid().nullable(),
  action: z.enum(['configure', 'receive', 'correct', 'allocate', 'return', 'waste', 'sale']),
  quantity: stockQuantitySchema,
  expectedVersion: z.number().int().nonnegative().nullable(),
  reason: z.string().trim().min(1, 'Enter a reason for this stock change.').max(500),
  trackingMode: trackingModeSchema.nullable(),
  unitLabel: z.string().trim().min(1).max(30).nullable(),
  requestId: z.guid(),
});

export function applyStock(catalogue: Catalogue, stock: PublicStock): Catalogue {
  const byId = new Map(stock.map((row) => [row.menu_item_id, row]));
  function update(item: CatalogueItem): CatalogueItem {
      const row = byId.get(item.id);
      const groups = item.groups?.map((group) => ({
        ...group, options: group.options.map((option) => {
          if (!option.linked_menu_item_id) return option;
          const linked = byId.get(option.linked_menu_item_id);
          const remaining = linked?.available_quantity ?? null;
          return { ...option, stock_quantity: remaining, is_available: option.is_available && Boolean(linked) && (remaining === null || remaining >= (option.linked_quantity ?? 1)) };
        }),
      })) ?? [];
      const updated = { ...item, groups, is_available: item.is_available && Boolean(row) && row?.available_quantity !== 0, stock_quantity: row?.available_quantity ?? null };
      return { ...updated, is_available: updated.is_available && hasRequiredChoices(updated) };
  }
  return {
    ...catalogue, items: catalogue.items.map(update),
    ...(catalogue.stockItems ? { stockItems: catalogue.stockItems.map(update) } : {}),
  };
}

export function stockDemand(lines: BagLine[], catalogue: Catalogue) {
  const quantities = new Map<string, number>();
  const sources = new Map<string, { name: string; available: number | null }>();
  for (const line of lines) {
    const item = catalogue.items.find((candidate) => candidate.id === line.itemId);
    if (!item) continue;
    if (item.item_kind !== 'group') {
      quantities.set(item.id, (quantities.get(item.id) ?? 0) + line.quantity);
      sources.set(item.id, { name: item.name, available: item.stock_quantity ?? null });
    }
    for (const option of item.groups?.flatMap((group) => group.options) ?? []) {
      if (!option.linked_menu_item_id || !line.optionIds.includes(option.id)) continue;
      const id = option.linked_menu_item_id;
      quantities.set(id, (quantities.get(id) ?? 0) + line.quantity * (option.linked_quantity ?? 1));
      sources.set(id, { name: option.name, available: option.stock_quantity ?? null });
    }
  }
  return { quantities, sources };
}

export function bagStockIssue(lines: BagLine[], catalogue: Catalogue): string {
  const { quantities, sources } = stockDemand(lines, catalogue);
  for (const [id, source] of sources) {
    if (source.available !== null && (quantities.get(id) ?? 0) > source.available) {
      return `${source.name}: only ${source.available} available for this event. Reduce the total quantity across your choices.`;
    }
  }
  return '';
}

export function maximumLineQuantity(line: BagLine, otherLines: BagLine[], catalogue: Catalogue): number {
  const demand = stockDemand([{ ...line, quantity: 1 }], catalogue);
  const existing = stockDemand(otherLines, catalogue);
  let maximum = 99;
  for (const [id, needed] of demand.quantities) {
    const available = demand.sources.get(id)?.available;
    if (available != null) maximum = Math.min(maximum, Math.max(0, Math.floor((available - (existing.quantities.get(id) ?? 0)) / needed)));
  }
  return maximum;
}

export function lineStockIssue(line: BagLine, otherLines: BagLine[], catalogue: Catalogue): string {
  const maximum = maximumLineQuantity(line, otherLines, catalogue);
  if (line.quantity <= maximum) return '';
  if (maximum > 0) return `Up to ${maximum} available for this selection. Reduce the quantity to continue.`;
  if (maximumLineQuantity(line, [], catalogue) > 0) {
    return 'Maximum quantity reached.';
  }
  const item = catalogue.items.find((candidate) => candidate.id === line.itemId);
  return item?.stock_quantity === 0
    ? 'This item is sold out for this event.'
    : 'Not enough stock for one item with these choices. Please change your choices.';
}

export function heldQuantity(rows: OrderStock[], itemId: string, eventId?: string, now = Date.now()) {
  return rows.filter((row) => row.menu_item_id === itemId && (!eventId || row.event_id === eventId)
    && row.state === 'held' && row.expires_at !== null && Date.parse(row.expires_at) > now)
    .reduce((sum, row) => sum + row.quantity, 0);
}

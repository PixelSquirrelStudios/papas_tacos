import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { adminError, adminRequest, adminRows } from '@/lib/admin/data';
import { inventoryItemSchema, allocationSchema, orderStockSchema, movementSchema, inventorySaleSchema } from '@/lib/inventory';
import { StockManager } from '@/components/admin/stock-manager';

export default async function StockPage({ searchParams }: { searchParams: Promise<{ event?: string; item?: string }> }) {
  await requireAdmin();
  const query = await searchParams;
  let data: Awaited<ReturnType<typeof loadStock>> | null = null;
  let failure = '';
  try {
    data = await loadStock();
  } catch (error) {
    console.error('[inventory] Admin overview unavailable', error);
    failure = adminError(error);
  }
  if (!data) return <main className="p-4 sm:p-8"><h1 className="text-3xl font-semibold">Stock</h1><p role="alert" className="mt-6 text-destructive">{failure}</p><p className="mt-3 text-sm text-muted-foreground">Stock changes are disabled until current balances can be loaded. Refresh after resolving the error.</p></main>;
  return <StockManager key={`${query.event ?? ''}:${query.item ?? ''}`} {...data} initialEvent={query.event ?? ''} initialItem={query.item ?? ''} />;
}

async function loadStock() {
  const [items, events, inventory, allocations, orders, movements, sales, choices, assignments, groups] = await Promise.all([
      adminRows('menu_items', { select: 'id,name,slug,is_available,archived_at,item_kind', order: 'name.asc,id.asc' }),
      adminRows('events', { select: 'id,title,starts_at,ends_at,ordering_status', order: 'starts_at.desc,id.asc' }),
      adminRows('inventory_items', { order: 'menu_item_id.asc' }),
      adminRows('inventory_allocations', { order: 'event_id.asc,menu_item_id.asc' }),
      adminRows('inventory_order_stock', { state: 'eq.held', expires_at: `gt.${new Date().toISOString()}`, order: 'order_id.asc,menu_item_id.asc' }),
      adminRequest('inventory_movements', { select: '*', order: 'created_at.desc,id.desc', limit: '100' }),
      adminRows('rpc/admin_inventory_sales', { order: 'menu_item_id.asc,event_id.asc' }),
      adminRows('modifier_options', { select: 'id,modifier_group_id,linked_menu_item_id', linked_menu_item_id: 'not.is.null' }),
      adminRows('menu_item_modifier_groups', { order: 'menu_item_id.asc,modifier_group_id.asc' }),
      adminRows('modifier_groups', { select: 'id,child_group_ids' }),
  ]);
  function containsGroup(root: string, target: unknown, visited = new Set<string>()): boolean {
    if (root === target) return true;
    if (visited.has(root) || visited.size >= 100) return false;
    visited.add(root);
    const children = groups.find((group) => group.id === root)?.child_group_ids;
    return Array.isArray(children) && children.some((child) => typeof child === 'string' && containsGroup(child, target, visited));
  }
  const uses = choices.flatMap((choice) => assignments.filter((assignment) => containsGroup(String(assignment.modifier_group_id), choice.modifier_group_id)).flatMap((assignment) => {
    const parent = items.find((item) => item.id === assignment.menu_item_id);
    return parent ? [{ menu_item_id: String(choice.linked_menu_item_id), parent_id: String(parent.id), parent_name: String(parent.name) }] : [];
  }));
  return { items: z.array(z.object({
      id: z.guid(), name: z.string(), slug: z.string(), is_available: z.boolean(), archived_at: z.string().nullable(), item_kind: z.enum(['product', 'group']),
    })).parse(items), events: z.array(z.object({
      id: z.guid(), title: z.string(), starts_at: z.string(), ends_at: z.string(), ordering_status: z.string(),
    })).parse(events), inventory: z.array(inventoryItemSchema).parse(inventory), allocations: z.array(allocationSchema).parse(allocations),
    orders: z.array(orderStockSchema).parse(orders), movements: z.array(movementSchema).parse(movements),
    sales: z.array(inventorySaleSchema).parse(sales), uses, now: Date.now() };
}

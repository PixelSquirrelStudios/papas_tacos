'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { adminError, adminRequest } from '@/lib/admin/data';
import { inventoryActionSchema, allocationSchema } from '@/lib/inventory';
import type { AdminResult } from '@/app/admin/actions';

function refreshStock() {
  revalidatePath('/admin/stock');
  revalidatePath('/admin/orders');
  revalidatePath('/menu');
}

export async function changeStock(input: unknown): Promise<AdminResult> {
  await requireAdmin();
  const parsed = inventoryActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your stock change.' };
  const value = parsed.data;
  try {
    await adminRequest('rpc/admin_inventory_action', {}, 'POST', {
      item_uuid: value.itemId, event_uuid: value.eventId, action: value.action,
      quantity: value.quantity, expected_version: value.expectedVersion, reason: value.reason,
      tracking_mode: value.trackingMode, unit_label: value.unitLabel, request_uuid: value.requestId,
    });
    refreshStock();
    return { ok: true };
  } catch (error) {
    console.error('[inventory] Admin stock change rejected', error);
    return { ok: false, error: adminError(error) };
  }
}

const reconciliationSchema = z.object({
  eventId: z.guid(), reason: z.string().trim().min(1).max(500),
  allocations: z.array(allocationSchema).min(1).max(1000),
});

export async function returnEventStock(input: unknown): Promise<AdminResult> {
  await requireAdmin();
  const parsed = reconciliationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Review the event allocations and enter a reconciliation reason.' };
  const value = parsed.data;
  if (value.allocations.some((row) => row.event_id !== value.eventId)) return { ok: false, error: 'Allocations must belong to the selected event.' };
  try {
    await adminRequest('rpc/admin_return_event_stock', {}, 'POST', {
      event_uuid: value.eventId, reason: value.reason,
      expected_allocations: value.allocations.map(({ menu_item_id, version, remaining }) => ({ menu_item_id, version, remaining })),
    });
    refreshStock();
    return { ok: true };
  } catch (error) {
    console.error('[inventory] Event reconciliation rejected', error);
    return { ok: false, error: adminError(error) };
  }
}

export async function restockOrder(input: unknown): Promise<AdminResult> {
  await requireAdmin();
  const parsed = z.object({ orderId: z.guid(), reason: z.string().trim().min(1).max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a reason to restore this cancelled order's stock." };
  try {
    await adminRequest('rpc/admin_restock_order', {}, 'POST', { order_uuid: parsed.data.orderId, reason: parsed.data.reason });
    refreshStock();
    revalidatePath(`/admin/orders/${parsed.data.orderId}`);
    return { ok: true };
  } catch (error) {
    console.error('[inventory] Order stock restoration rejected', error);
    return { ok: false, error: adminError(error) };
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { adminError, adminRequest, AdminDataError } from '@/lib/admin/data';
import { getResource, resourceSchema } from '@/lib/admin/resources';

export type AdminResult = { ok: boolean; error?: string; fields?: Record<string, string>; id?: string };
const identity = z.guid();
const version = z.iso.datetime({ offset: true });

function refresh() {
  revalidatePath('/admin', 'layout');
  revalidatePath('/', 'layout');
}

export async function saveRecord(key: string, id: string | null, updatedAt: string | null, values: unknown): Promise<AdminResult> {
  await requireAdmin();
  const resource = getResource(key);
  if (!resource) return { ok: false, error: 'Unknown resource.' };
  const parsed = resourceSchema(resource).safeParse(values);
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields.', fields: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])) };
  if (id && !identity.safeParse(id).success) return { ok: false, error: 'Invalid record ID.' };
  if ((id || resource.singleton) && !version.safeParse(updatedAt).success) return { ok: false, error: 'Refresh to load the current version.' };
  try {
    const editing = Boolean(id || resource.singleton);
    const query = editing ? { ...(resource.singleton ? { singleton: 'eq.true' } : { id: `eq.${id}` }), updated_at: `eq.${updatedAt}`, select: '*' } : { select: '*' };
    const result = await adminRequest(resource.table, query, editing ? 'PATCH' : 'POST', parsed.data);
    if (result.length !== 1) throw new AdminDataError('CONFLICT', 'This record changed or was removed. Refresh before editing again.');
    refresh();
    return { ok: true, id: result[0].id };
  } catch (error) { return { ok: false, error: adminError(error) }; }
}

export async function removeRecord(key: string, id: string, updatedAt: string, archive = false): Promise<AdminResult> {
  await requireAdmin();
  const resource = getResource(key);
  if (!resource || resource.singleton || !identity.safeParse(id).success || !version.safeParse(updatedAt).success) return { ok: false, error: 'Invalid record.' };
  if (archive && key !== 'menu') return { ok: false, error: 'Only menu items can be archived.' };
  try {
    const result = await adminRequest(resource.table, { id: `eq.${id}`, updated_at: `eq.${updatedAt}` }, archive ? 'PATCH' : 'DELETE', archive ? { archived_at: new Date().toISOString(), is_published: false, is_available: false } : undefined);
    if (result.length !== 1) throw new AdminDataError('CONFLICT', 'This record changed or was removed. Refresh before trying again.');
    refresh();
    return { ok: true };
  } catch (error) { return { ok: false, error: adminError(error) }; }
}

export async function unarchiveMenuItem(id: string, updatedAt: string): Promise<AdminResult> {
  await requireAdmin();
  if (!identity.safeParse(id).success || !version.safeParse(updatedAt).success) return { ok: false, error: 'Invalid menu item.' };
  try {
    const result = await adminRequest('menu_items', { id: `eq.${id}`, updated_at: `eq.${updatedAt}`, archived_at: 'not.is.null' }, 'PATCH', { archived_at: null, is_published: false, is_available: false });
    if (result.length !== 1) throw new AdminDataError('CONFLICT', 'This item changed or is no longer archived. Refresh before trying again.');
    refresh();
    return { ok: true };
  } catch (error) { return { ok: false, error: adminError(error) }; }
}

export async function setMenuAvailability(id: string, updatedAt: string, available: boolean): Promise<AdminResult> {
  await requireAdmin();
  if (!identity.safeParse(id).success || !version.safeParse(updatedAt).success || !z.boolean().safeParse(available).success) return { ok: false, error: 'Invalid availability request.' };
  try {
    const result = await adminRequest('menu_items', { id: `eq.${id}`, updated_at: `eq.${updatedAt}`, archived_at: 'is.null' }, 'PATCH', { is_available: available });
    if (result.length !== 1) throw new AdminDataError('CONFLICT', 'This item changed or was archived. Refresh before trying again.');
    refresh();
    return { ok: true };
  } catch (error) { return { ok: false, error: adminError(error) }; }
}

export async function reorderRecords(key: string, ids: string[], previous: string[], scope: string | null): Promise<AdminResult> {
  await requireAdmin();
  const resource = getResource(key);
  const list = z.array(identity).max(10000);
  if (!resource?.sortable || !list.safeParse(ids).success || !list.safeParse(previous).success || (scope !== null && !identity.safeParse(scope).success)) return { ok: false, error: 'Invalid ordering request.' };
  try {
    await adminRequest('rpc/admin_reorder', {}, 'POST', { resource: resource.table, ordered_ids: ids, expected_ids: previous, scope_id: scope });
    refresh();
    return { ok: true };
  } catch (error) { return { ok: false, error: adminError(error) }; }
}

export async function assignGroups(id: string, groupIds: string[], updatedAt: string): Promise<AdminResult> {
  await requireAdmin();
  if (!identity.safeParse(id).success || !z.array(identity).max(30).safeParse(groupIds).success || !version.safeParse(updatedAt).success) return { ok: false, error: 'Invalid modifier assignment.' };
  try {
    await adminRequest('rpc/admin_assign_modifier_groups', {}, 'POST', { item_id: id, group_ids: groupIds, expected_updated_at: updatedAt });
    refresh();
    return { ok: true };
  } catch (error) { return { ok: false, error: adminError(error) }; }
}

export async function setOrderingStatus(status: string, updatedAt: string): Promise<AdminResult> {
  await requireAdmin();
  if (!z.enum(['open', 'closed']).safeParse(status).success || !version.safeParse(updatedAt).success) return { ok: false, error: 'Invalid ordering settings.' };
  try {
    const result = await adminRequest('business_settings', { singleton: 'eq.true', updated_at: `eq.${updatedAt}` }, 'PATCH', { ordering_status: status });
    if (result.length !== 1) throw new AdminDataError('CONFLICT', 'Ordering settings changed. The latest status will be loaded; try again.');
    refresh();
    return { ok: true };
  } catch (error) { return { ok: false, error: adminError(error) }; }
}

export async function updateOrder(id: string, operation: string, reason = ''): Promise<AdminResult> {
  await requireAdmin();
  if (!identity.safeParse(id).success || !['preparing', 'ready_for_pickup', 'collected', 'cancelled', 'cash_paid'].includes(operation)) return { ok: false, error: 'Invalid order operation.' };
  if (reason.length > 500 || (operation === 'cancelled' && !reason.trim())) return { ok: false, error: 'Enter a cancellation reason (maximum 500 characters).' };
  try {
    await adminRequest(`rpc/${operation === 'cash_paid' ? 'admin_mark_cash_paid' : 'admin_set_order_status'}`, {}, 'POST', operation === 'cash_paid' ? { order_uuid: id } : { order_uuid: id, next_status: operation, reason: reason.trim() || null });
    refresh();
    return { ok: true };
  } catch (error) { return { ok: false, error: adminError(error) }; }
}
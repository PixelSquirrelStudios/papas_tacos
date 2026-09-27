import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { adminRows, adminError, adminRequest } from '@/lib/admin/data';
import { getResource, type AdminRow } from '@/lib/admin/resources';
import { ResourceManager } from '@/components/admin/resource-manager';
import { PickupManager } from '@/components/admin/pickup-manager';
import { pickupChoicesSchema } from '@/lib/pickup';

export default async function ResourcePage({ params }: { params: Promise<{ resource: string }> }) {
  await requireAdmin();
  const { resource: key } = await params;
  const resource = getResource(key);
  if (!resource) notFound();
  if (key === 'slots') {
    let pickupData: { events: AdminRow[]; schedules: AdminRow[]; slots: ReturnType<typeof pickupChoicesSchema.parse> } | null = null;
    let pickupError = '';
    try {
      const [events, schedules, choices] = await Promise.all([adminRows('events', { order: 'sort_order.asc,id.asc' }), adminRows('pickup_schedules'), adminRequest('rpc/get_pickup_choices', {}, 'POST', {})]);
      pickupData = { events, schedules, slots: pickupChoicesSchema.parse(choices) };
    } catch (failure) { pickupError = adminError(failure); }
    if (pickupData) return <PickupManager {...pickupData} />;
    return <main className="p-8"><h1 className="text-2xl font-semibold">Pickup Slots</h1><p role="alert" className="mt-5 text-destructive">{pickupError}</p></main>;
  }
  let rows: AdminRow[] = [];
  let references: Record<string, AdminRow[]> = {};
  let associations: AdminRow[] = [];
  let error = '';
  try {
    const tables = [...new Set(resource.fields.flatMap((field) => field.reference ? [field.reference] : []))];
    if (key === 'menu') tables.push('modifier_groups');
    [rows, references, associations] = await Promise.all([
      adminRows(resource.table, { order: resource.order }),
      Promise.all(tables.map(async (table) => [table, await adminRows(table, { order: ['menu_categories', 'modifier_groups'].includes(table) ? 'sort_order.asc,id.asc' : 'id.asc' })] as const)).then(Object.fromEntries),
      key === 'menu' ? adminRows('menu_item_modifier_groups', { order: 'sort_order.asc,modifier_group_id.asc' }) : Promise.resolve([]),
    ]);
  } catch (failure) { error = adminError(failure); }
  if (error) return <main className="p-8"><h1 className="text-2xl font-semibold">{resource.title}</h1><p role="alert" className="mt-5 text-destructive">{error}</p></main>;
  return <ResourceManager resourceKey={key} rows={rows} references={references} associations={associations} />;
}
import { requireAdmin } from '@/lib/auth/session';
import { adminRows, adminError } from '@/lib/admin/data';
import type { AdminRow } from '@/lib/admin/resources';
import { DashboardOverview } from '@/components/admin/dashboard-overview';

export default async function AdminPage() {
  const viewer = await requireAdmin();
  let orders: AdminRow[] = [], menu: AdminRow[] = [], events: AdminRow[] = [], settings: AdminRow[] = [];
  let error = '';
  try {
    [orders, menu, events, settings] = await Promise.all([
      adminRows('orders', { select: 'id,order_number,customer_name,status,total_pence,pickup_starts_at', status: 'in.(pending_payment,ordered,preparing,ready_for_pickup)', order: 'pickup_starts_at.asc,id.asc' }),
      adminRows('menu_items', { select: 'id,is_published,is_available', archived_at: 'is.null' }),
      adminRows('events', { select: 'id,title,starts_at,venue_name', ends_at: `gte.${new Date().toISOString()}`, order: 'starts_at.asc,id.asc' }),
      adminRows('business_settings', { order: 'singleton.asc' }),
    ]);
  } catch (failure) { error = adminError(failure); }
  return <DashboardOverview fullName={viewer.profile?.full_name} orders={orders} menu={menu} events={events} settings={settings[0]} error={error} />;
}
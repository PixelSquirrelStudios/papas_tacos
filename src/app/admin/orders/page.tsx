import Link from 'next/link';
import { ArrowRight, Clock3, MapPin, ReceiptText, UserRound } from 'lucide-react';
import { requireAdmin } from '@/lib/auth/session';
import { adminRows, adminRequest, adminError } from '@/lib/admin/data';
import type { AdminRow } from '@/lib/admin/resources';
import { adminDate, orderFilterParams, parseOrderFilters } from '@/lib/admin/orders';
import { choiceLabel } from '@/lib/catalogue/format';
import { money } from '@/lib/bag';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { statusLabels, paymentLabels } from '@/lib/account/orders';
import { OrderFilters } from '@/components/admin/order-filters';
import { OrderControls } from '@/components/admin/order-controls';
import { deliveryLabel, serviceMode, orderStatusLabel } from '@/lib/service-ordering';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const { statuses, events: selectedEvents, search, page } = parseOrderFilters(params);
  const query: Record<string, string> = { select: 'id,order_number,customer_name,pickup_starts_at,pickup_location,status,payment_status,payment_method,total_pence,event_id,order_items(item_name,quantity)', order: statuses.length === 1 && statuses[0] === 'ordered' ? 'created_at.asc,id.asc' : 'created_at.desc,id.desc', limit: '51', offset: String(page * 50) };
  if (statuses.length) query.status = `in.(${statuses.join(',')})`;
  if (selectedEvents.length) query.event_id = `in.(${selectedEvents.join(',')})`;
  if (search) {
    query.or = `(${/^\d+$/.test(search) ? `order_number.eq.${search},` : ''}customer_name.ilike.*${search}*,pickup_location->>location_number.ilike.*${search}*,pickup_location->>number_plate.ilike.*${search}*)`;
  }
  let orders: AdminRow[] = [], events: AdminRow[] = [];
  let counts: AdminRow | undefined;
  let error = '';
  try {
    const [rows, eventRows, totals] = await Promise.all([adminRequest('orders', query), adminRows('events', { select: 'id,title', order: 'starts_at.desc,id.asc' }), adminRequest('rpc/admin_order_counts', {}, 'POST', { event_uuids: selectedEvents, search_text: search })]);
    orders = rows; events = eventRows; counts = totals[0];
  } catch (failure) { error = adminError(failure); }
  const filterParams = orderFilterParams(search, statuses, selectedEvents);
  const pageLink = (next: number) => { const params = new URLSearchParams(filterParams); params.set('page', String(next)); return `/admin/orders?${params}`; };
  return <main className="min-w-0 px-4 py-8 sm:px-8 lg:px-10"><div className="mb-7"><p className="mb-2 text-xs font-semibold uppercase text-turquoise">Service</p><h1 className="text-3xl font-semibold">Orders</h1></div>
    <OrderFilters initialSearch={typeof params.q === 'string' ? params.q : ''} initialStatuses={statuses} initialEvents={selectedEvents} events={events.map((entry) => ({ value: entry.id!, label: String(entry.title) }))} />
    {counts && <section aria-label="Order Counts" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['outstanding', 'Outstanding'], ['complete', 'Complete / Collected'], ['cancelled', 'Cancelled'], ['pending_payment', 'Awaiting Payment']].map(([key, label]) => <div key={key} className="rounded-lg border p-4"><p className="text-2xl font-semibold">{String(counts[key])}</p><p className="text-sm text-muted-foreground">{label}</p></div>)}</section>}
    <nav aria-label="Service Queue" className="mb-6 flex flex-wrap gap-4">{[['ordered', 'Outstanding Service Orders'], ['collected', 'Complete / Collected'], ['all', 'All Orders']].map(([status, label]) => { const params = orderFilterParams(search, status === 'all' ? [] : [status], selectedEvents); return <Link key={status} href={`/admin/orders?${params}`} className="text-sm text-turquoise underline underline-offset-4">{label}</Link>; })}</nav>
    {error ? <p role="alert" className="text-destructive">{error}</p> : <><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{orders.slice(0, 50).map((order) => <article key={order.id} className={`flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm ${order.status === 'ready_for_pickup' ? 'border-turquoise/50' : 'border-border'}`}>
      <div className="flex flex-1 flex-col gap-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Order #{String(order.order_number)}</h2><Badge variant="outline" className={order.status === 'ready_for_pickup' ? 'bg-turquoise/10 text-turquoise' : ''}>{order.status === 'collected' ? orderStatusLabel(String(order.status), order.pickup_location) : statusLabels[order.status as keyof typeof statusLabels]}</Badge></div>
        {serviceMode(order.pickup_location) !== 'pickup' && <><p className="text-xl font-semibold text-turquoise">{deliveryLabel(order.pickup_location)}</p>{Array.isArray(order.order_items) && <ul className="text-sm">{order.order_items.map((item: { item_name: string; quantity: number }, index) => <li key={index}>{item.quantity} x {item.item_name}</li>)}</ul>}<OrderControls order={order} completionOnly /></>}
        <p className="flex items-start gap-2 break-words text-sm"><UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{String(order.customer_name)}</p>
        <div className="space-y-2 text-sm text-muted-foreground"><p className="flex items-start gap-2"><Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{serviceMode(order.pickup_location) === 'pickup' ? adminDate(order.pickup_starts_at) : 'Delivery as soon as possible'}</p><p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{String(events.find((entry) => entry.id === order.event_id)?.title ?? 'Event')}</p></div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-4"><p className="text-xl font-semibold tabular-nums text-brand-yellow">{money(Number(order.total_pence))}</p><p className="text-xs text-muted-foreground"><span className="capitalize">{choiceLabel(String(order.payment_method))}</span> / {paymentLabels[order.payment_status as keyof typeof paymentLabels]}</p></div>
      </div><div className="border-t bg-background/30 px-5 py-3"><Button asChild className="w-full"><Link href={`/admin/orders/${order.id}`} aria-label={`View Order ${order.order_number}`}>View Order<ArrowRight /></Link></Button></div>
    </article>)}</div>{!orders.length && <div className="rounded-lg border border-dashed py-16 text-center"><ReceiptText className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" /><h2 className="font-semibold">No Matching Orders</h2></div>}<div className="mt-6 flex items-center justify-between border-t pt-5"><span className="text-sm text-muted-foreground">Page {page + 1}</span><div className="flex gap-3">{page > 0 && <Button asChild><Link href={pageLink(page - 1)}>Previous</Link></Button>}{orders.length > 50 && <Button asChild><Link href={pageLink(page + 1)}>Next</Link></Button>}</div></div></>}
  </main>;
}
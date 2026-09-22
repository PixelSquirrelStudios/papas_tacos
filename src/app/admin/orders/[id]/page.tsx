import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { requireAdmin } from '@/lib/auth/session';
import { adminRequest, adminRows, adminError } from '@/lib/admin/data';
import type { AdminRow } from '@/lib/admin/resources';
import { adminDate } from '@/lib/admin/orders';
import { money } from '@/lib/bag';
import { choiceLabel } from '@/lib/catalogue/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OrderControls } from '@/components/admin/order-controls';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  let order: AdminRow | undefined;
  let items: AdminRow[] = [], payments: AdminRow[] = [], history: AdminRow[] = [];
  let error = '';
  try {
    const [orders, lines, paymentRows, statusRows] = await Promise.all([
      adminRequest('orders', { id: `eq.${id}` }),
      adminRows('order_items', { order_id: `eq.${id}`, select: '*,order_item_modifiers(*)', order: 'created_at.asc,id.asc' }),
      adminRows('payments', { order_id: `eq.${id}`, order: 'created_at.desc,id.desc' }),
      adminRows('order_status_history', { order_id: `eq.${id}`, order: 'created_at.desc,id.desc' }),
    ]);
    order = orders[0]; items = lines; payments = paymentRows; history = statusRows;
  } catch (failure) { error = adminError(failure); }
  if (error) return <main className="p-8"><p role="alert" className="text-destructive">{error}</p></main>;
  if (!order) notFound();
  const location = order.pickup_location as Record<string, unknown>;
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8"><Button asChild variant="ghost" className="mb-5"><Link href="/admin/orders"><ArrowLeft />Orders</Link></Button><div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-semibold">Order #{String(order.order_number)}</h1><p className="mt-2 text-sm text-muted-foreground">{adminDate(order.created_at)}</p></div><Badge variant="secondary">{choiceLabel(String(order.status))}</Badge></div>
    <div className="my-7 border-y py-5"><OrderControls order={order} /></div>
    <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]"><section><h2 className="mb-4 text-lg font-semibold">Items</h2><div className="divide-y">{items.map((item) => <div key={item.id} className="py-4"><div className="flex justify-between gap-4 font-medium"><span>{String(item.quantity)} x {String(item.item_name)}</span><span>{money(Number(item.line_total_pence))}</span></div><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{(item.order_item_modifiers as AdminRow[] ?? []).map((modifier) => <li key={modifier.id}>{String(modifier.group_name)}: {String(modifier.option_name)} {Number(modifier.unit_price_pence) > 0 ? `(+${money(Number(modifier.unit_price_pence))})` : ''}</li>)}</ul>{(item.allergen_snapshot as string[]).length > 0 && <p className="mt-2 text-sm text-primary">Contains: {(item.allergen_snapshot as string[]).map(choiceLabel).join(', ')}</p>}</div>)}</div><dl className="mt-4 space-y-3 border-t pt-4 text-sm">{[['Subtotal', order.subtotal_pence], ['Service Fee', order.service_fee_pence], ['Packaging', order.packaging_fee_pence], ['Total', order.total_pence]].map(([label, amount]) => <div key={String(label)} className="flex justify-between"><dt>{String(label)}</dt><dd className="font-semibold">{money(Number(amount))}</dd></div>)}</dl>
      <h2 className="mb-4 mt-10 text-lg font-semibold">Payment Records</h2><p className="mb-4 text-sm">{choiceLabel(String(order.payment_method))} / {choiceLabel(String(order.payment_status))}</p>{payments.map((payment) => <div key={payment.id} className="border-t py-3 text-sm"><p>{choiceLabel(String(payment.provider))} · {choiceLabel(String(payment.status))} · {money(Number(payment.amount_pence))}</p><p className="mt-1 text-muted-foreground">{adminDate(payment.paid_at ?? payment.created_at)}</p>{Number(payment.refunded_pence) > 0 && <p>Refunded: {money(Number(payment.refunded_pence))}</p>}</div>)}{!payments.length && <p className="text-sm text-muted-foreground">No recorded payments.</p>}
    </section><aside className="min-w-0 space-y-8"><section><h2 className="mb-3 text-lg font-semibold">Customer</h2><p>{String(order.customer_name)}</p><p className="mt-2 break-all text-sm text-muted-foreground">{String(order.customer_email)}</p><p className="mt-1 text-sm text-muted-foreground">{String(order.customer_phone)}</p>{order.customer_note ? <p className="mt-4 whitespace-pre-wrap rounded-md border border-primary/40 p-3 text-sm">{String(order.customer_note)}</p> : null}</section><section><h2 className="mb-3 text-lg font-semibold">Pickup</h2><p className="text-sm">{adminDate(order.pickup_starts_at)} - {adminDate(order.pickup_ends_at)}</p><p className="mt-2 text-sm text-muted-foreground">{['venue_name', 'address_line_1', 'address_line_2', 'town', 'postcode'].map((key) => location?.[key]).filter(Boolean).join(', ')}</p></section>{order.cancellation_reason ? <section><h2 className="mb-3 text-lg font-semibold">Cancellation Reason</h2><p className="text-sm">{String(order.cancellation_reason)}</p></section> : null}<section><h2 className="mb-3 text-lg font-semibold">Status History</h2><ol className="space-y-4 border-l pl-4">{history.map((entry) => <li key={entry.id}><p className="text-sm font-medium">{choiceLabel(String(entry.status))}</p><p className="text-xs text-muted-foreground">{adminDate(entry.created_at)}</p></li>)}</ol></section></aside></div>
  </main>;
}
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Clock3, MapPin, ReceiptText, UtensilsCrossed } from 'lucide-react';
import { money } from '@/lib/bag';
import { choiceLabel } from '@/lib/catalogue/format';
import { orderDate, pickupWindow, pickupAddress, statusLabels, paymentLabels, type OrderSummary, type CustomerOrder } from '@/lib/account/orders';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function OrderStatus({ order }: { order: OrderSummary }) {
  return <Badge variant="outline" className={order.status === 'ready_for_pickup' ? 'border-turquoise/50 bg-turquoise/10 text-turquoise' : order.status === 'cancelled' ? 'border-primary/50 text-primary' : 'text-foreground'}>{statusLabels[order.status]}</Badge>;
}

export function OrderList({ orders, emptyTitle = 'No Orders Yet' }: { orders: OrderSummary[]; emptyTitle?: string }) {
  if (!orders.length) return <div className="border-y border-dashed py-10 text-center">
    <ReceiptText className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" />
    <h3 className="text-lg font-semibold">{emptyTitle}</h3>
    <Button asChild className="mt-5"><Link href="/menu"><UtensilsCrossed aria-hidden="true" />Browse the Menu</Link></Button>
  </div>;
  return <ul className="grid gap-4 lg:grid-cols-2">{orders.map((order) => <li key={order.id} className={`min-w-0 rounded-lg border bg-card shadow-sm transition-colors hover:border-brand-yellow/50 ${order.status === 'ready_for_pickup' ? 'border-turquoise/40' : 'border-border'}`}>
    <Link href={`/account?view=orders&order=${order.id}`} className="group flex h-full flex-col gap-5 p-5 outline-offset-4">
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">Order #{order.order_number}</h3><OrderStatus order={order} /></div>
        <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground"><Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{pickupWindow(order)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{order.pickup_location.venue_name || order.pickup_location.event_title}</p>
      </div>
      <div className="flex items-center justify-between gap-4 border-t pt-4"><div><p className="text-xl font-semibold tabular-nums text-brand-yellow">{money(order.total_pence)}</p><p className="mt-1 text-xs text-muted-foreground">{paymentLabels[order.payment_status]}</p></div><span className="flex items-center gap-2 text-sm font-medium text-brand-yellow">View Order<ArrowRight className="size-4" aria-hidden="true" /></span></div>
    </Link>
  </li>)}</ul>;
}

const progressSteps = ['ordered', 'preparing', 'ready_for_pickup', 'collected'] as const;

export function OrderDetails({ order }: { order: CustomerOrder }) {
  const currentStep = progressSteps.findIndex((status) => status === order.status);
  return <div>
    <Button asChild variant="ghost" className="mb-5"><Link href="/account?view=orders"><ArrowLeft aria-hidden="true" />All Orders</Link></Button>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold">Order #{order.order_number}</h2><p className="mt-2 text-sm text-muted-foreground">Placed {orderDate(order.created_at)}</p></div><OrderStatus order={order} /></div>
    {order.status === 'cancelled' ? <p role="status" className="mt-6 border-l-2 border-primary bg-primary/5 p-4 text-sm">{order.cancellation_reason || 'This order has been cancelled.'}</p>
      : order.status === 'pending_payment' ? <div role="status" className="mt-6 border-l-2 border-brand-yellow bg-brand-yellow/5 p-4 text-sm"><p>Payment has not been confirmed.</p>{order.reservation_expires_at && <p className="mt-1 text-muted-foreground">Reservation expires {orderDate(order.reservation_expires_at)}.</p>}</div>
      : <ol aria-label="Order progress" className="my-8 grid grid-cols-2 gap-5 border-y py-6 sm:grid-cols-4">{progressSteps.map((status, index) => <li key={status} aria-current={index === currentStep ? 'step' : undefined} className={index <= currentStep ? 'text-turquoise' : 'text-muted-foreground'}><span className={`mb-2 flex size-7 items-center justify-center rounded-full border ${index <= currentStep ? 'border-turquoise bg-turquoise/10' : 'border-border'}`}>{index < currentStep ? <Check className="size-4" aria-hidden="true" /> : <span className="text-xs">{index + 1}</span>}</span><span className="text-sm font-medium">{statusLabels[status]}</span></li>)}</ol>}
    <div className="mt-8 grid gap-10 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section aria-labelledby="order-items-title"><h3 id="order-items-title" className="mb-4 text-lg font-semibold">Your Order</h3>
        <ul className="divide-y">{order.order_items.map((item) => <li key={item.id} className="py-4 first:pt-0"><div className="flex justify-between gap-4 font-medium"><span className="min-w-0 break-words">{item.quantity} x {item.item_name}</span><span className="shrink-0 tabular-nums">{money(item.line_total_pence)}</span></div>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{item.order_item_modifiers.map((modifier) => <li key={modifier.id}>{modifier.group_name}: {modifier.option_name}{modifier.unit_price_pence > 0 ? ` (+${money(modifier.unit_price_pence)} each)` : ''}</li>)}</ul>
          {item.allergen_snapshot.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Contains: {item.allergen_snapshot.map(choiceLabel).join(', ')}</p>}
        </li>)}</ul>
        <dl className="mt-4 space-y-3 border-t pt-4 text-sm">{([['Subtotal', order.subtotal_pence], ['Service Fee', order.service_fee_pence], ['Packaging', order.packaging_fee_pence], ['Total', order.total_pence]] as const).map(([label, value]) => <div key={label} className={`flex justify-between gap-4 ${label === 'Total' ? 'border-t pt-3 text-base font-semibold' : ''}`}><dt>{label}</dt><dd className="tabular-nums">{money(value)}</dd></div>)}</dl>
        <p className="mt-4 text-sm text-muted-foreground">{order.payment_method === 'cash' ? 'Cash' : 'Card'} / {paymentLabels[order.payment_status]}{order.payment_method === 'cash' && order.payment_status === 'unpaid' && order.status !== 'cancelled' ? ' - pay at pickup' : ''}</p>
        {order.customer_note && <div className="mt-8"><h3 className="mb-2 font-semibold">Your Note</h3><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{order.customer_note}</p></div>}
      </section>
      <aside className="min-w-0 space-y-8">
        <section><h3 className="mb-3 flex items-center gap-2 text-lg font-semibold"><MapPin className="size-5 text-brand-yellow" aria-hidden="true" />Pickup</h3><p className="text-sm font-medium">{pickupWindow(order)}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pickupAddress(order.pickup_location)}</p>{order.status === 'ready_for_pickup' && <p role="status" className="mt-3 text-sm font-medium text-turquoise">Your order is ready. Show order #{order.order_number} at collection.</p>}</section>
        <section><h3 className="mb-2 font-semibold">Collection Details</h3><p className="break-words text-sm text-muted-foreground">{order.customer_name}</p><p className="mt-1 text-sm text-muted-foreground">{order.customer_phone}</p></section>
        <section><h3 className="mb-4 font-semibold">Order Updates</h3><ol className="space-y-4 border-l pl-4">{order.order_status_history.map((entry) => <li key={entry.id}><p className="text-sm font-medium">{statusLabels[entry.status]}</p><time dateTime={entry.created_at} className="text-xs text-muted-foreground">{orderDate(entry.created_at)}</time></li>)}</ol>{!order.order_status_history.length && <p className="text-sm text-muted-foreground">No updates recorded yet.</p>}</section>
      </aside>
    </div>
  </div>;
}
import { z } from 'zod';

export const orderStatuses = ['pending_payment', 'ordered', 'preparing', 'ready_for_pickup', 'collected', 'cancelled'] as const;
export const statusLabels = {
  pending_payment: 'Awaiting Payment', ordered: 'Order Received', preparing: 'Preparing',
  ready_for_pickup: 'Ready for Pickup', collected: 'Collected', cancelled: 'Cancelled',
};
export const paymentLabels = { unpaid: 'Unpaid', paid: 'Paid', partially_refunded: 'Partially Refunded', refunded: 'Refunded', failed: 'Payment Failed' };
const amount = z.number().int().nonnegative();
const timestamp = z.string().datetime({ offset: true });
export const orderSummarySchema = z.object({
  id: z.guid(), order_number: z.number().int().positive(), status: z.enum(orderStatuses),
  payment_method: z.enum(['card', 'cash']), payment_status: z.enum(['unpaid', 'paid', 'partially_refunded', 'refunded', 'failed']),
  total_pence: amount, created_at: timestamp, pickup_starts_at: timestamp, pickup_ends_at: timestamp,
  pickup_location: z.object({
    event_title: z.string().optional(), venue_name: z.string().optional(), address_line_1: z.string().optional(),
    address_line_2: z.string().nullable().optional(), town: z.string().optional(), postcode: z.string().optional(),
  }),
});
export const orderDetailSchema = orderSummarySchema.extend({
  customer_name: z.string(), customer_phone: z.string(), customer_note: z.string(),
  subtotal_pence: amount, service_fee_pence: amount, packaging_fee_pence: amount,
  cancellation_reason: z.string().nullable(), reservation_expires_at: timestamp.nullable(),
  order_items: z.array(z.object({
    id: z.guid(), item_name: z.string(), quantity: z.number().int().positive(), line_total_pence: amount,
    allergen_snapshot: z.array(z.string()),
    order_item_modifiers: z.array(z.object({ id: z.guid(), group_name: z.string(), option_name: z.string(), unit_price_pence: amount })),
  })),
  order_status_history: z.array(z.object({ id: z.guid(), status: z.enum(orderStatuses), created_at: timestamp })),
});
export type OrderSummary = z.infer<typeof orderSummarySchema>;
export type CustomerOrder = z.infer<typeof orderDetailSchema>;
export type OrderFilter = 'all' | 'active' | 'past';
export const ordersPerPage = 10;
const summarySelect = 'id,order_number,status,payment_method,payment_status,total_pence,created_at,pickup_starts_at,pickup_ends_at,pickup_location';

export function orderPage(value: unknown) {
  const page = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : 1;
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
}

export function customerOrderQuery(customerId: string, options: { page?: number; filter?: OrderFilter; id?: string } = {}) {
  const query = new URLSearchParams({
    customer_id: `eq.${z.guid().parse(customerId)}`, select: summarySelect,
    order: 'created_at.desc,id.desc', limit: String(ordersPerPage),
    offset: String((orderPage(String(options.page ?? 1)) - 1) * ordersPerPage),
  });
  if (options.filter === 'active') query.set('status', 'in.(pending_payment,ordered,preparing,ready_for_pickup)');
  if (options.filter === 'past') query.set('status', 'in.(collected,cancelled)');
  if (options.id) {
    query.set('id', `eq.${z.guid().parse(options.id)}`);
    query.set('limit', '1');
    query.set('offset', '0');
    query.set('select', `${summarySelect},customer_name,customer_phone,customer_note,subtotal_pence,service_fee_pence,packaging_fee_pence,cancellation_reason,reservation_expires_at,order_items(id,item_name,quantity,line_total_pence,allergen_snapshot,order_item_modifiers(id,group_name,option_name,unit_price_pence)),order_status_history(id,status,created_at)`);
    query.set('order_items.order', 'created_at.asc,id.asc');
    query.set('order_status_history.order', 'created_at.asc,id.asc');
  }
  return query;
}

export function pickupAddress(location: OrderSummary['pickup_location']) {
  return [location.venue_name, location.address_line_1, location.address_line_2, location.town, location.postcode].filter(Boolean).join(', ');
}

export function orderDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function pickupWindow(order: OrderSummary) {
  const end = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date(order.pickup_ends_at));
  return `${orderDate(order.pickup_starts_at)} - ${end}`;
}
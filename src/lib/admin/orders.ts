import { z } from 'zod';

export const orderStatuses = ['pending_payment', 'ordered', 'preparing', 'ready_for_pickup', 'collected', 'cancelled'];
const activeStatuses = orderStatuses.slice(0, 4);

export function parseOrderFilters(params: Record<string, string | string[] | undefined>) {
  const values = (value: string | string[] | undefined) => value === undefined ? [] : Array.isArray(value) ? value : [value];
  const requested = values(params.status);
  const valid = requested.filter((status) => orderStatuses.includes(status));
  return {
    statuses: requested.includes('all') ? [] : [...new Set(requested.includes('active') ? [...activeStatuses, ...valid] : valid)],
    events: [...new Set(values(params.event).filter((event) => z.guid().safeParse(event).success))],
    search: typeof params.q === 'string' ? params.q.replace(/[^a-zA-Z0-9 @.+-]/g, '').slice(0, 100).trim() : '',
    page: Math.max(0, Math.min(10000, Number.parseInt(String(params.page ?? '0'), 10) || 0)),
  };
}

export function orderFilterParams(search: string, statuses: string[], events: string[]) {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  for (const status of statuses.length ? statuses : ['all']) params.append('status', status);
  for (const event of events) params.append('event', event);
  return params;
}

export function orderOperations(status: string, paymentMethod: string, paymentStatus: string) {
  const operations: { value: string; label: string }[] = [];
  if (status === 'ordered') operations.push({ value: 'preparing', label: 'Start Preparing' });
  if (status === 'preparing') operations.push({ value: 'ready_for_pickup', label: 'Ready for Pickup' });
  if (status === 'ready_for_pickup' && ['paid', 'partially_refunded', 'refunded'].includes(paymentStatus)) operations.push({ value: 'collected', label: 'Mark Collected' });
  if (paymentMethod === 'cash' && paymentStatus === 'unpaid' && status !== 'cancelled') operations.push({ value: 'cash_paid', label: 'Record Cash Payment' });
  if (['pending_payment', 'ordered', 'preparing', 'ready_for_pickup'].includes(status)) operations.push({ value: 'cancelled', label: 'Cancel Order' });
  return operations;
}

export function adminDate(value: unknown) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(String(value)));
}
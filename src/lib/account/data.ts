import 'server-only';
import { requireAccount } from '@/lib/auth/session';
import { createServerSupabase } from '@/lib/supabase/server';
import { supabaseConfig } from '@/lib/supabase/config';
import { customerOrderQuery, orderSummarySchema, orderDetailSchema, type OrderFilter } from './orders';

async function requestOrders(options: { page?: number; filter?: OrderFilter; id?: string }) {
  const viewer = await requireAccount('/account');
  const config = supabaseConfig();
  const client = await createServerSupabase();
  const { data: { session } } = await client.auth.getSession();
  if (!config || !session) throw new Error('Account session unavailable');
  const url = new URL('/rest/v1/orders', config.url);
  url.search = customerOrderQuery(viewer.user.id, options).toString();
  const response = await fetch(url, {
    cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { apikey: config.key, Authorization: `Bearer ${session.access_token}`, Prefer: 'count=exact' },
  });
  if (!response.ok) throw new Error('Orders unavailable');
  const count = response.headers.get('content-range')?.split('/')[1];
  const total = count && count !== '*' ? Number(count) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Order count unavailable');
  return { rows: await response.json() as unknown, total };
}

export async function getCustomerOrders(options: { page?: number; filter?: OrderFilter } = {}) {
  const result = await requestOrders(options);
  return { orders: orderSummarySchema.array().parse(result.rows), total: result.total };
}

export async function getCustomerOrder(id: string) {
  const result = await requestOrders({ id });
  return orderDetailSchema.array().parse(result.rows)[0] ?? null;
}
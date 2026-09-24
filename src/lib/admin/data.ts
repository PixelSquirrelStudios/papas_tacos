import 'server-only';
import { requireAdmin } from '@/lib/auth/session';
import { createServerSupabase } from '@/lib/supabase/server';
import { supabaseConfig } from '@/lib/supabase/config';
import type { AdminRow } from './resources';

export class AdminDataError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export async function adminRequest(path: string, query: Record<string, string> = {}, method = 'GET', body?: unknown): Promise<AdminRow[]> {
  await requireAdmin();
  const config = supabaseConfig();
  const client = await createServerSupabase();
  const { data: { session } } = await client.auth.getSession();
  if (!config || !session) throw new AdminDataError('AUTH', 'Sign in again to continue.');
  const url = new URL(`/rest/v1/${path === 'business_settings' ? 'admin_business_settings' : path}`, config.url);
  url.search = new URLSearchParams(query).toString();
  const response = await fetch(url, {
    method, cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { apikey: config.key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new AdminDataError(String(error.code || response.status), String(error.message || 'Database request failed'));
  }
  if (response.status === 204) return [];
  const result = await response.json();
  return Array.isArray(result) ? result : result ? [result] : [];
}

export async function adminRows(table: string, query: Record<string, string> = {}) {
  const rows: AdminRow[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const batch = await adminRequest(table, { select: '*', order: 'id.asc', ...query, limit: '500', offset: String(offset) });
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
  throw new AdminDataError('LIMIT', 'This list exceeds 10,000 records. Narrow the selection before continuing.');
}

export function adminError(error: unknown) {
  if (error instanceof AdminDataError) {
    if (['42703', 'PGRST202', 'PGRST204'].includes(error.code)) return 'An admin database upgrade is missing. Apply SQL 018_admin_management.sql, 019_modifier_group_ordering.sql and 020_menu_item_crowd_favourites.sql in order, then refresh.';
    if (error.code === '23503') return 'This record is still referenced. Archive menu items, or remove unused links and slots before deleting.';
    if (error.code === '23505') return 'That slug or pickup time already exists. Choose a unique value.';
    if (error.code === '23514') return 'The database rejected these values. Check dates, prices and limits.';
    if (error.code === '42501' || error.code === 'AUTH') return 'Administrator access is required. Sign in again.';
    if (['P0001', 'LIMIT', 'CONFLICT'].includes(error.code)) return error.message;
  }
  return 'Unable to complete the request. Check your connection and try again.';
}
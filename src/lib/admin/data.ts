import 'server-only';
import { cache } from 'react';
import { requireAdmin } from '@/lib/auth/session';
import { createServerSupabase } from '@/lib/supabase/server';
import { supabaseConfig } from '@/lib/supabase/config';
import type { AdminRow } from './resources';

export class AdminDataError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const adminContext = cache(async () => {
  await requireAdmin();
  const config = supabaseConfig();
  const client = await createServerSupabase();
  const { data: { session } } = await client.auth.getSession();
  if (!config || !session) throw new AdminDataError('AUTH', 'Sign in again to continue.');
  return { config, token: session.access_token };
});

export async function adminRequest(path: string, query: Record<string, string> = {}, method = 'GET', body?: unknown): Promise<AdminRow[]> {
  const { config, token } = await adminContext();
  const url = new URL(`/rest/v1/${path === 'business_settings' ? 'admin_business_settings' : path}`, config.url);
  url.search = new URLSearchParams(query).toString();
  const response = await fetch(url, {
    method, cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { apikey: config.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
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
    if (['42P01', 'PGRST205', 'PGRST202'].includes(error.code) && /pickup_schedules|get_pickup_choices|admin_lock_pickup_slot/i.test(error.message)) return 'Pickup scheduling requires database upgrades 038, 039 and 040 in supabase/sql. Apply them in order, then refresh.';
    if (['42703', 'PGRST204'].includes(error.code) && /child_group_ids/i.test(error.message)) return 'Nested modifier groups are not available in the database yet. Apply supabase/sql/034_modifier_group_nesting.sql, then 035 and 036 for nested checkout, and refresh.';
    if (['42703', 'PGRST204'].includes(error.code) && /modifier_options/i.test(error.message) && /\b(description|image_path|image_alt)\b/i.test(error.message)) return 'Modifier option images and descriptions are not available in the database yet. Apply supabase/sql/031_modifier_option_content.sql, then refresh. SQL 032 does not include these columns.';
    if (error.code === 'PGRST202' && /admin_save_menu_item/i.test(error.message)) return 'The menu-item save function is unavailable in the database API. Apply supabase/sql/032_menu_item_modifier_save.sql to this project; if already applied, reload the PostgREST schema cache, then refresh.';
    if (['42703', 'PGRST202', 'PGRST204'].includes(error.code)) return `The database API is missing an expected column or function (${error.code}). Check outstanding upgrades in supabase/sql; if already applied, reload the PostgREST schema cache, then refresh.`;
    if (error.code === '23503') return 'This record is still referenced. Archive menu items, or remove unused links and slots before deleting.';
    if (error.code === '23505') return 'That slug or pickup time already exists. Choose a unique value.';
    if (error.code === '23514') return 'The database rejected these values. Check dates, prices and limits.';
    if (error.code === '42501' || error.code === 'AUTH') return 'Administrator access is required. Sign in again.';
    if (['P0001', 'LIMIT', 'CONFLICT'].includes(error.code)) return error.message;
  }
  return 'Unable to complete the request. Check your connection and try again.';
}
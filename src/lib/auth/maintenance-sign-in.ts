import 'server-only';

import { getMaintenanceMode } from '@/lib/catalogue/data';
import { supabaseConfig } from '@/lib/supabase/config';

export async function canRequestMagicLink(email: string): Promise<boolean> {
  if ((await getMaintenanceMode()) === false) return true;
  const config = supabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!config || !secret) return false;
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const filterEmail = normalizedEmail.replace(/[\\%_*"]/g, '\\$&');
    const url = new URL('/rest/v1/profiles', config.url);
    url.search = new URLSearchParams({ select: 'email,role', role: 'eq.admin', email: `ilike."${filterEmail}"`, limit: '1' }).toString();
    const response = await fetch(url, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}` },
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const rows = await response.json();
    return Array.isArray(rows) && rows.length === 1 && rows[0]?.role === 'admin'
      && typeof rows[0].email === 'string' && rows[0].email.toLowerCase() === normalizedEmail;
  } catch {
    return false;
  }
}
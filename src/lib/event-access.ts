import 'server-only';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { supabaseConfig } from '@/lib/supabase/config';
import { getViewer } from '@/lib/auth/session';
import { adminRequest } from '@/lib/admin/data';

export const eventAccessKey = z.string().regex(/^[a-f0-9]{64}$/);
export const eventAccessCookie = (id: string) => `papas-event-${id}`;

export async function savedEventAccess(id: string) {
  if ((await getViewer())?.profile?.role === 'admin') {
    const [event] = await adminRequest('events', { id: `eq.${id}`, select: 'id,is_private' });
    if (event?.is_private) {
      const [result] = await adminRequest('rpc/admin_event_ordering_key', {}, 'POST', { event_uuid: id });
      return eventAccessKey.parse(result?.access_key);
    }
  }
  const value = (await cookies()).get(eventAccessCookie(id))?.value;
  return eventAccessKey.safeParse(value).success ? value : undefined;
}

export async function checkEventAccess(id: string, key: string) {
  const config = supabaseConfig();
  if (!config) throw new Error('Event access is not configured.');
  const response = await fetch(new URL('/rest/v1/rpc/check_event_ordering_access', config.url), {
    method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_uuid: id, supplied_key: key }), cache: 'no-store', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Event access could not be verified. Apply database upgrade 046.');
  return z.boolean().parse(await response.json());
}

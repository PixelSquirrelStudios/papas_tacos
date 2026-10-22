import { z } from 'zod';
import { supabaseConfig } from '@/lib/supabase/config';
import { getMaintenanceMode } from '@/lib/catalogue/data';
import { getViewer } from '@/lib/auth/session';
import { savedEventAccess } from '@/lib/event-access';
import { publicStockSchema } from '@/lib/inventory';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const eventId = new URL(request.url).searchParams.get('eventId');
  if (eventId !== null && !z.guid().safeParse(eventId).success) {
    return Response.json({ error: 'Choose a valid event.' }, { status: 400, headers });
  }
  const maintenance = await getMaintenanceMode();
  if (maintenance !== false && !(maintenance === true && (await getViewer())?.profile?.role === 'admin')) {
    return Response.json({ error: 'Ordering is temporarily unavailable.' }, { status: 503, headers });
  }
  try {
    const config = supabaseConfig();
    if (!config) throw new Error('Stock database not configured');
    const response = await fetch(new URL('/rest/v1/rpc/get_event_stock', config.url), {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { apikey: config.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_uuid: eventId, supplied_key: eventId ? await savedEventAccess(eventId) ?? null : null }),
    });
    if (!response.ok) throw new Error(`Stock request failed (${response.status})`);
    const stock = publicStockSchema.parse(await response.json());
    return Response.json({ stock }, { headers });
  } catch (error) {
    console.error('[stock] Availability check failed', error);
    return Response.json({ error: 'Stock availability could not be checked. Please refresh before ordering.' }, { status: 503, headers });
  }
}

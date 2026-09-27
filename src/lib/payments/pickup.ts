import 'server-only';
import { supabaseConfig } from '@/lib/supabase/config';
import { createServerSupabase } from '@/lib/supabase/server';
import { pickupChoicesSchema, type PickupChoice } from '@/lib/pickup';

export async function getPickupChoices(): Promise<{ slots: PickupChoice[]; error: boolean }> {
  const config = supabaseConfig();
  if (!config) return { slots: [], error: true };
  try {
    const supabase = await createServerSupabase();
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) return { slots: [], error: true };
    const response = await fetch(new URL('/rest/v1/rpc/get_checkout_pickup_choices', config.url), {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10000),
      headers: { apikey: config.key, Authorization: `Bearer ${session?.access_token ?? config.key}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!response.ok) return { slots: [], error: true };
    return { slots: pickupChoicesSchema.parse(await response.json()), error: false };
  } catch { return { slots: [], error: true }; }
}
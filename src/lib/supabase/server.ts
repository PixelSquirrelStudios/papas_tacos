import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseConfig } from './config';
import type { Database } from './database.types';

export async function createServerSupabase() {
  const config = supabaseConfig();
  if (!config) throw new Error('Supabase authentication is not configured.');
  const cookieStore = await cookies();
  return createServerClient<Database>(config.url, config.key, {
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        cache: 'no-store',
        signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
      }),
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          return;
        }
      },
    },
  });
}
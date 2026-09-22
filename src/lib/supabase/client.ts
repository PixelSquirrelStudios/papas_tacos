'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabaseConfig } from './config';
import type { Database } from './database.types';

export function createBrowserSupabase() {
  const config = supabaseConfig();
  if (!config) throw new Error('Supabase authentication is not configured.');
  return createBrowserClient<Database>(config.url, config.key);
}
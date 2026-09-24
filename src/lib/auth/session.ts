import 'server-only';

import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { supabaseConfig } from '@/lib/supabase/config';
import { safeReturnPath } from './redirects';

export const getViewer = cache(async () => {
  if (!supabaseConfig()) return null;
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase.from('profiles')
    .select('id, full_name, phone, role, created_at, updated_at')
    .eq('id', user.id).maybeSingle();
  return { user, profile };
});

export async function requireAccount(returnTo = '/account') {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(safeReturnPath(returnTo))}`);
  return viewer;
}

export async function requireAdmin() {
  const viewer = await requireAccount('/admin');
  if (viewer.profile?.role !== 'admin') notFound();
  return viewer;
}
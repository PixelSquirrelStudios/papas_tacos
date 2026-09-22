import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { appOrigin, safeReturnPath, signedInPath } from './redirects';
import { exchangeCredentials } from './exchange';

export async function completeSignIn(request: NextRequest) {
  let origin: string;
  try {
    origin = appOrigin(process.env.SITE_URL, request.nextUrl.origin, process.env.NODE_ENV === 'production');
  } catch {
    return new NextResponse('Authentication is temporarily unavailable.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get('next'));
  let success = false;
  let destination = returnTo;
  try {
    const supabase = await createServerSupabase();
    success = await exchangeCredentials(supabase.auth, request.nextUrl.searchParams);
    if (success) {
      const { data: { user }, error } = await supabase.auth.getUser();
      success = Boolean(user && !error);
      if (user && !error) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
        destination = signedInPath(returnTo, profile?.role);
      }
    }
  } catch {
    success = false;
  }
  if (!success) destination = `/login?error=invalid_link&next=${encodeURIComponent(returnTo)}`;
  const response = NextResponse.redirect(new URL(destination, origin), 303);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
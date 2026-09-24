import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfig } from '@/lib/supabase/config';
import { getMaintenanceMode } from '@/lib/catalogue/data';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = supabaseConfig();
  const pathname = request.nextUrl.pathname;
  const isSignIn = pathname === '/sign-in' || pathname === '/sign-in/';
  const bypass = ['/auth', '/api', '/sign-in', '/maintenance', '/_next', '/images'].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (config) {
    const supabase = createServerClient(config.url, config.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    });
    await supabase.auth.getClaims();
    if ((!bypass || isSignIn) && (await getMaintenanceMode()) !== false) {
      let isAdmin = false;
      let shouldClearSession = false;
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        shouldClearSession = Boolean(user || (error && error.name !== 'AuthSessionMissingError'));
        if (!error && user) {
          const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
          isAdmin = !profileError && profile?.role === 'admin';
        }
      } catch {
        isAdmin = false;
        shouldClearSession = true;
      }
      if (!isAdmin && (!isSignIn || shouldClearSession)) {
        if (isSignIn) {
          try {
            const { error } = await supabase.auth.signOut({ scope: 'local' });
            if (error) throw error;
          } catch {
            return new NextResponse('Unable to clear your session. Please retry signing in shortly.', {
              status: 503, headers: { 'Cache-Control': 'private, no-store, max-age=0' },
            });
          }
        }
        const destination = request.nextUrl.clone();
        destination.pathname = isSignIn ? '/sign-in' : '/maintenance';
        if (isSignIn) destination.searchParams.set('error', 'maintenance');
        else destination.search = '';
        const redirectResponse = NextResponse.redirect(destination, isSignIn ? 303 : 307);
        for (const cookie of response.cookies.getAll()) redirectResponse.cookies.set(cookie);
        response = redirectResponse;
      }
    }
  }
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  if (request.nextUrl.pathname.startsWith('/auth/')) response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)'],
};
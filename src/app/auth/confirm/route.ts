import { NextResponse, type NextRequest } from 'next/server';
import { completeSignIn } from '@/lib/auth/callback';
import { safeReturnPath } from '@/lib/auth/redirects';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const hash = params.get('token_hash');
  const type = params.get('type');
  const valid = !params.has('error') && !params.has('error_code') && (
    (code && code.length <= 4096 && !hash)
    || (hash && hash.length <= 4096 && !code && ['email', 'signup', 'magiclink'].includes(type || ''))
  );
  if (!valid) return completeSignIn(request);
  return new NextResponse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Complete Sign In | Papa's Tacos</title>
<style>
body{margin:0;background:#111816;color:#f7f5ef;font-family:system-ui,sans-serif;line-height:1.6}
main{max-width:420px;margin:12vh auto;padding:24px}
h1{font-size:2.25rem;line-height:1.15}p{color:#c8ceca}
button{width:100%;padding:16px;border:0;border-radius:6px;background:#f1c644;color:#171914;font:inherit;font-weight:700;cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid #6ed8cc;outline-offset:4px}
a{color:#6ed8cc}small{display:block;margin-top:24px;color:#c8ceca}
</style></head><body><main>
<p>PAPA'S TACOS</p><h1>You're one step away.</h1>
<p>Tap below to finish signing in and return to where you left off. Simply opening this page does not use your sign-in link.</p>
<form method="post"><button type="submit">Continue Signing In</button></form>
<small>Only continue if you requested this link. Otherwise, you can safely close this page.</small>
<p><a href="/sign-in?next=${encodeURIComponent(safeReturnPath(params.get('next')))}">Request a New Sign-in Link</a></p>
</main></body></html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'Referrer-Policy': 'same-origin',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    },
  });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    console.warn('[auth] Rejected cross-origin email confirmation.');
    const destination = new URL('/sign-in', request.nextUrl.origin);
    destination.searchParams.set('error', 'invalid_link');
    destination.searchParams.set('next', safeReturnPath(request.nextUrl.searchParams.get('next')));
    return NextResponse.redirect(destination, {
      status: 303, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });
  }
  return completeSignIn(request);
}
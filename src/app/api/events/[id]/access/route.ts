import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkEventAccess, eventAccessCookie, eventAccessKey } from '@/lib/event-access';
import { eventMenuLink } from '@/lib/service-ordering';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = eventAccessKey.safeParse(new URL(request.url).searchParams.get('key'));
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  const unavailable = (reason: string) => NextResponse.redirect(new URL(`/events/ordering-unavailable?reason=${reason}`, request.url), { status: 303, headers });
  if (!z.guid().safeParse(id).success || !key.success) {
    return unavailable('invalid');
  }
  try {
    if (!await checkEventAccess(id, key.data)) {
      return unavailable('expired');
    }
    const response = NextResponse.redirect(new URL(eventMenuLink(id), request.url), { status: 303, headers });
    response.cookies.set(eventAccessCookie(id), key.data, { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 });
    return response;
  } catch {
    console.error('[events] QR access verification unavailable', { eventId: id });
    return unavailable('verification');
  }
}

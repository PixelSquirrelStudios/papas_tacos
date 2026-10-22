import QRCode from 'qrcode';
import { z } from 'zod';
import { getViewer } from '@/lib/auth/session';
import { appOrigin } from '@/lib/auth/redirects';
import { adminRequest, adminError } from '@/lib/admin/data';
import { eventMenuLink } from '@/lib/service-ordering';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const viewer = await getViewer();
    if (!viewer) return new Response('Sign in to generate event QR codes.', { status: 401, headers });
    if (viewer.profile?.role !== 'admin') return new Response('Administrator access required.', { status: 403, headers });
    const { id } = await params;
    if (!z.guid().safeParse(id).success) return new Response('Event not found.', { status: 404, headers });
    const [event] = await adminRequest('events', { id: `eq.${id}`, select: 'id,is_private' });
    if (!event) return new Response('Event not found.', { status: 404, headers });
    const origin = appOrigin(process.env.SITE_URL, new URL(request.url).origin, process.env.NODE_ENV === 'production');
    let path = eventMenuLink(id);
    if (event.is_private) {
      const [result] = await adminRequest('rpc/admin_event_ordering_key', {}, 'POST', { event_uuid: id });
      const key = z.string().regex(/^[a-f0-9]{64}$/).parse(result?.access_key);
      path = `/api/events/${id}/access?key=${key}`;
    }
    const url = new URL(path, origin).href;
    if (new URL(request.url).searchParams.get('open') === '1') {
      return new Response(null, { status: 303, headers: { ...headers, Location: url, 'Referrer-Policy': 'no-referrer' } });
    }
    const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 512 });
    const download = new URL(request.url).searchParams.get('download') === '1';
    return new Response(svg, { headers: { ...headers, 'Content-Type': 'image/svg+xml', 'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="event-${id}-ordering-qr.svg"`, 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
  } catch (error) {
    return new Response(adminError(error), { status: 503, headers });
  }
}

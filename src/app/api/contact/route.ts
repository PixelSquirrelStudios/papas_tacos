import 'server-only';
import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { z } from 'zod';
import { getSettings } from '@/lib/catalogue/data';
import { httpsLink } from '@/lib/catalogue/format';
import { enquiryEmail, enquirySchema } from '@/lib/contact/enquiry';
import { allowEnquiry } from '@/lib/contact/rate-limit';

export const runtime = 'nodejs';

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 24000) { await reader.cancel(); throw new Error('Body too large'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const expectedOrigin = new URL(process.env.SITE_URL || request.url).origin;
  if (origin !== expectedOrigin) return reply({ error: 'Please submit your enquiry from our website.' }, 403);
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return reply({ error: 'Invalid request.' }, 415);
  const address = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const key = createHash('sha256').update(address).digest('hex');
  if (!allowEnquiry(key)) return reply({ error: 'Too many attempts. Please try again in ten minutes.' }, 429);
  let body: unknown;
  try { body = await readBody(request); } catch { return reply({ error: 'Your enquiry could not be read. Check its length and try again.' }, 400); }
  const parsed = enquirySchema.safeParse(body);
  if (!parsed.success) return reply({ error: 'Check the highlighted fields.', fields: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])) }, 400);
  if (parsed.data.website) return reply({ ok: true });
  const apiKey = process.env.RESEND_API_KEY;
  const from = z.email().safeParse(process.env.RESEND_FROM_EMAIL);
  const settings = await getSettings();
  const recipient = z.email().safeParse(process.env.BOOKING_ENQUIRY_TO || settings?.contact_email);
  if (!apiKey || !from.success || !recipient.success) return reply({ error: 'Enquiries are temporarily unavailable. Please contact us by email or phone.' }, 503);
  try {
    const resend = new Resend(apiKey);
    const idempotencyKey = createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex');
    const { data, error } = await resend.emails.send({
      from: `Papa's Tacos <${from.data}>`,
      to: [recipient.data],
      replyTo: parsed.data.email,
      ...enquiryEmail(parsed.data, {
        siteUrl: expectedOrigin,
        logoUrl: 'https://cpkzvicxoivdhxjkhexl.supabase.co/storage/v1/object/public/images/Papas_Tacos_Logo_Horizontal.svg',
        instagramUrl: httpsLink(settings?.instagram_url),
        facebookUrl: httpsLink(settings?.facebook_url),
      }),
    }, { idempotencyKey: `booking-enquiry/${idempotencyKey}` });
    if (error || !data?.id) return reply({ error: 'Your enquiry could not be sent. Please try again shortly.' }, 502);
    return reply({ ok: true });
  } catch {
    return reply({ error: 'Your enquiry could not be sent. Please try again shortly.' }, 502);
  }
}
import { timingSafeEqual } from 'node:crypto';
import { sendOrderStatusEmails } from '@/lib/payments/send-status-emails';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response('Retry worker is not configured', { status: 503, headers });
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get('authorization') || '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new Response('Unauthorized', { status: 401, headers });
  try {
    const result = await sendOrderStatusEmails();
    return Response.json(result, { status: result.failed ? 503 : 200, headers });
  } catch { return new Response('Email queue unavailable', { status: 503, headers }); }
}
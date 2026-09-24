import { stripeClient } from '@/lib/payments/server';
import { applyStripeEvent } from '@/lib/payments/webhook';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('Webhook is not configured', { status: 503 });
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });
  if (Number(request.headers.get('content-length')) > 1048576) return new Response('Payload too large', { status: 413 });
  const body = await request.text();
  if (Buffer.byteLength(body) > 1048576) return new Response('Payload too large', { status: 413 });
  let event;
  try {
    event = stripeClient().webhooks.constructEvent(body, signature, secret);
  } catch {
    return new Response('Invalid webhook signature', { status: 400 });
  }
  try {
    await applyStripeEvent(event);
    return Response.json({ received: true });
  } catch {
    console.error('[stripe] Webhook processing failed', { eventId: event.id, type: event.type });
    return new Response('Webhook processing failed', { status: 500 });
  }
}
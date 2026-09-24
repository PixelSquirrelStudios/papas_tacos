import 'server-only';
import type Stripe from 'stripe';
import { paymentDatabase, stripeClient } from './server';
import { sendOrderConfirmation } from './send-confirmation';

export async function applyStripeEvent(event: Stripe.Event) {
  if (event.livemode) throw new Error('Live payments are not enabled');
  const database = paymentDatabase();
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.expired') {
    const session = event.data.object;
    if (session.metadata?.integration !== 'papas_tacos') return;
    if (event.type === 'checkout.session.completed' && session.payment_status !== 'paid') return;
    if (!session.metadata.order_id || session.amount_total === null || session.currency !== 'gbp') throw new Error('Invalid checkout event');
    const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
    const { data: refundRequired, error } = await database.rpc('process_stripe_checkout', {
      event_id: event.id, event_kind: event.type, order_uuid: session.metadata.order_id,
      session_id: session.id, intent_id: intent, amount: session.amount_total, payment_currency: session.currency,
    });
    if (error) throw new Error('Payment update failed');
    if (refundRequired && intent) {
      await stripeClient().refunds.create({ payment_intent: intent }, { idempotencyKey: `cancelled-order-${session.metadata.order_id}` });
    } else if (event.type === 'checkout.session.completed') {
      await sendOrderConfirmation(session.metadata.order_id);
    }
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    if (charge.metadata.integration !== 'papas_tacos') return;
    const intent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (!intent) throw new Error('Missing payment intent');
    const { error } = await database.rpc('process_stripe_refund', { event_id: event.id, intent_id: intent, refunded: charge.amount_refunded });
    if (error) throw new Error('Refund update failed');
  }
}
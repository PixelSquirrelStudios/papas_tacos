'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getViewer } from '@/lib/auth/session';
import { appOrigin } from '@/lib/auth/redirects';
import { getMaintenanceMode } from '@/lib/catalogue/data';
import { checkoutConfigured, paymentDatabase, stripeClient } from '@/lib/payments/server';
import { checkoutSchema, type CheckoutResult } from '@/lib/payments/validation';

export async function startCheckout(input: unknown): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { error: 'Check your contact details, pickup time and bag before continuing.' };
  const viewer = await getViewer();
  if (!viewer?.user.email) return { error: 'Sign in before checking out.' };
  if (!checkoutConfigured() || (await getMaintenanceMode()) !== false) return { error: 'Card checkout is temporarily unavailable.' };
  try {
    const requestHeaders = await headers();
    const origin = appOrigin(process.env.SITE_URL, requestHeaders.get('origin') || '', process.env.NODE_ENV === 'production');
    const { key, ...values } = parsed.data;
    const database = paymentDatabase();
    const { data: order, error } = await database.rpc('reserve_card_order', {
      customer_uuid: viewer.user.id, request_key: key, payload: { ...values, email: viewer.user.email },
    });
    if (error) {
      const safeMessages = ['Card checkout is unavailable', 'Complete or cancel an existing checkout first', 'Checkout request changed. Start a new checkout.', 'A menu item is no longer available', 'A selected choice is no longer available', 'Review the required choices for your items', 'Prices have changed. Refresh your bag before paying.', 'Pickup slot is full', 'Pickup slot unavailable', 'Minimum food order amount not met', 'Pickup slot outside trading hours or preparation lead time'];
      return { error: safeMessages.includes(error.message) ? error.message : 'Checkout is unavailable. Refresh your bag and try again.' };
    }
    if (order.customer_id !== viewer.user.id || order.status !== 'pending_payment') return { error: 'This checkout has already finished. Check your account orders.' };
    const stripe = stripeClient();
    const { data: payment, error: paymentError } = await database.from('payments').select('stripe_checkout_session_id').eq('order_id', order.id).eq('provider', 'stripe').single();
    if (paymentError) throw new Error('Payment unavailable');
    if (payment.stripe_checkout_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(payment.stripe_checkout_session_id);
      return existing.status === 'open' && existing.url ? { url: existing.url, orderId: order.id } : { error: 'This payment session has ended. Check your account orders.' };
    }
    const { data: items, error: itemsError } = await database.from('order_items').select('item_name,quantity,unit_price_pence,unit_extras_pence,order_item_modifiers(group_name,option_name)').eq('order_id', order.id).order('created_at').order('id');
    if (itemsError || !items?.length) throw new Error('Order items unavailable');
    const lineItems = items.map((item) => ({
      quantity: item.quantity,
      price_data: { currency: 'gbp', unit_amount: item.unit_price_pence + item.unit_extras_pence, product_data: {
        name: item.item_name,
        ...(item.order_item_modifiers.length ? { description: item.order_item_modifiers.map((choice) => `${choice.group_name}: ${choice.option_name}`).join('; ').slice(0, 500) } : {}),
      } },
    }));
    for (const [name, value] of [['Service fee', order.service_fee_pence], ['Packaging', order.packaging_fee_pence]] as const) {
      if (value > 0) lineItems.push({ quantity: 1, price_data: { currency: 'gbp', unit_amount: value, product_data: { name } } });
    }
    const expiresAt = Math.floor(new Date(order.reservation_expires_at).getTime() / 1000);
    if (expiresAt < Math.floor(Date.now() / 1000) + 31 * 60) return { error: 'This checkout could not start in time. Contact us or wait for the reservation to be released.' };
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', payment_method_types: ['card'], customer_email: order.customer_email,
      client_reference_id: order.id, metadata: { order_id: order.id, integration: 'papas_tacos' },
      payment_intent_data: { metadata: { order_id: order.id, integration: 'papas_tacos' } },
      line_items: lineItems, expires_at: expiresAt,
      success_url: `${origin}/account?view=orders&order=${order.id}&payment=returned`,
      cancel_url: `${origin}/checkout?order=${order.id}`,
    }, { idempotencyKey: `checkout-${order.id}` });
    const { error: attachError } = await database.rpc('attach_stripe_checkout', {
      order_uuid: order.id, session_id: session.id, expires_at: new Date(session.expires_at * 1000).toISOString(),
    });
    if (attachError || !session.url) throw new Error('Payment session unavailable');
    return { url: session.url, orderId: order.id };
  } catch {
    return { error: 'We could not open payment. Try again with the same bag; check your orders before starting another checkout.' };
  }
}

export async function cancelCheckout(formData: FormData) {
  const viewer = await getViewer();
  const orderId = z.guid().safeParse(formData.get('orderId'));
  if (!viewer || !orderId.success) redirect('/sign-in?next=%2Faccount');
  const { data: sessionId, error } = await paymentDatabase().rpc('cancel_card_checkout', { order_uuid: orderId.data, customer_uuid: viewer.user.id });
  if (!error && sessionId) {
    try { await stripeClient().checkout.sessions.expire(sessionId); }
    catch { console.error('[stripe] Could not expire cancelled checkout', { orderId: orderId.data }); }
  }
  revalidatePath('/account');
  redirect(`/account?view=orders&order=${orderId.data}`);
}
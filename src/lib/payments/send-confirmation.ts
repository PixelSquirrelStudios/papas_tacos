import 'server-only';
import { Resend } from 'resend';
import { z } from 'zod';
import { orderDetailSchema } from '@/lib/account/orders';
import { appOrigin } from '@/lib/auth/redirects';
import { getSettings } from '@/lib/catalogue/data';
import { httpsLink } from '@/lib/catalogue/format';
import { supabaseConfig } from '@/lib/supabase/config';
import { paymentDatabase } from './server';
import { orderConfirmationEmail } from './confirmation-email';

const payloadSchema = z.object({
  from: z.string().min(1), to: z.array(z.email()).length(1), replyTo: z.email().optional(),
  subject: z.string(), text: z.string(), html: z.string(),
});

export async function sendOrderConfirmation(orderId: string) {
  const database = paymentDatabase();
  const deliveries = () => database.from('order_confirmation_emails');
  const { data: existing, error: deliveryError } = await deliveries().select('*').eq('order_id', orderId).maybeSingle();
  if (deliveryError) throw new Error('Confirmation delivery records unavailable');
  if (existing?.sent_at) return;
  const { data: row, error: orderError } = await database.from('orders')
    .select('*,order_items(*,order_item_modifiers(*)),order_status_history(*)').eq('id', orderId).single();
  if (orderError || !row) throw new Error('Confirmation order unavailable');
  if (row.payment_status !== 'paid' || !['ordered', 'preparing', 'ready_for_pickup', 'collected'].includes(row.status)) return;
  const order = orderDetailSchema.extend({ customer_email: z.email() }).parse(row);
  let delivery = existing;
  if (!delivery) {
    const from = z.email().parse(process.env.RESEND_FROM_EMAIL);
    const origin = appOrigin(process.env.SITE_URL, process.env.STRIPE_FORWARD_ORIGIN || 'http://localhost:3000', process.env.NODE_ENV === 'production');
    const settings = await getSettings();
    const contact = z.email().safeParse(settings?.contact_email);
    const config = supabaseConfig();
    if (!config) throw new Error('Email branding unavailable');
    const email = orderConfirmationEmail(order, {
      siteUrl: origin,
      logoUrl: new URL('/storage/v1/object/public/images/Papas_Tacos_Logo_Horizontal.svg', config.url).href,
      instagramUrl: httpsLink(settings?.instagram_url), facebookUrl: httpsLink(settings?.facebook_url),
    });
    const payload = { from: `Papa's Tacos <${from}>`, to: [order.customer_email], ...(contact.success ? { replyTo: contact.data } : {}), ...email };
    const { error } = await deliveries().upsert({ order_id: orderId, payload }, { onConflict: 'order_id', ignoreDuplicates: true });
    if (error) throw new Error('Confirmation snapshot could not be saved');
    const result = await deliveries().select('*').eq('order_id', orderId).single();
    if (result.error || !result.data) throw new Error('Confirmation snapshot unavailable');
    delivery = result.data;
  }
  if (delivery.sent_at) return;
  const created = Date.parse(delivery.created_at);
  if (!Number.isFinite(created) || Date.now() - created >= 23 * 60 * 60 * 1000) {
    console.error('[orders] Confirmation email requires delivery reconciliation', { orderId });
    throw new Error('Confirmation delivery requires reconciliation before retrying beyond Resend idempotency window');
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Confirmation email provider is not configured');
  const { data, error } = await new Resend(apiKey).emails.send(payloadSchema.parse(delivery.payload), {
    idempotencyKey: `order-confirmation/${orderId}`,
  });
  if (error || !data?.id) throw new Error('Confirmation email was not accepted');
  const { error: saveError } = await deliveries().update({ sent_at: new Date().toISOString(), resend_email_id: data.id }).eq('order_id', orderId).is('sent_at', null);
  if (saveError) throw new Error('Confirmation delivery could not be recorded');
}
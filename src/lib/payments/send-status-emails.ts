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

const stageSchema = z.enum(['preparing', 'ready_for_pickup', 'collected', 'cancelled']);
const payloadSchema = z.object({ from: z.string().min(1), to: z.array(z.email()).length(1), replyTo: z.email().optional(), subject: z.string(), text: z.string(), html: z.string() });

export async function sendOrderStatusEmails(orderId?: string) {
  const database = paymentDatabase();
  const deliveries = () => database.from('order_status_emails');
  let query = deliveries().select('*').is('sent_at', null).order('sequence').limit(50);
  if (orderId) query = query.eq('order_id', orderId);
  const { data: pending, error } = await query;
  if (error || !pending) throw new Error('Status email queue unavailable. Apply migration 044.');
  const blocked = new Set<string>();
  let sent = 0;
  let failed = 0;
  for (const entry of pending) {
    if (blocked.has(entry.order_id)) continue;
    try {
      let delivery = entry;
      if (!delivery.payload) {
        const order = orderDetailSchema.extend({ customer_email: z.email() }).parse(delivery.order_snapshot);
        const settings = await getSettings();
        const config = supabaseConfig();
        if (!config || !settings) throw new Error('Email branding unavailable');
        const origin = appOrigin(process.env.SITE_URL, process.env.STRIPE_FORWARD_ORIGIN || 'http://localhost:3000', process.env.NODE_ENV === 'production');
        const contact = z.email().safeParse(settings.contact_email);
        const email = orderConfirmationEmail(order, {
          siteUrl: origin,
          logoUrl: new URL('/storage/v1/object/public/images/Papas_Tacos_Logo_Horizontal.svg', config.url).href,
          instagramUrl: httpsLink(settings.instagram_url), facebookUrl: httpsLink(settings.facebook_url),
        }, stageSchema.parse(delivery.status));
        const payload = { from: `Papa's Tacos <${z.email().parse(process.env.RESEND_FROM_EMAIL)}>`, to: [order.customer_email], ...(contact.success ? { replyTo: contact.data } : {}), ...email };
        const { error: saveError } = await deliveries().update({ payload, payload_created_at: new Date().toISOString() }).eq('id', delivery.id).is('payload', null);
        if (saveError) throw new Error('Email payload could not be saved');
        const result = await deliveries().select('*').eq('id', delivery.id).single();
        if (result.error || !result.data) throw new Error('Email payload unavailable');
        delivery = result.data;
      }
      if (delivery.sent_at) continue;
      const created = Date.parse(delivery.payload_created_at);
      if (!Number.isFinite(created) || Date.now() - created >= 23 * 60 * 60 * 1000) throw new Error('Email needs manual delivery reconciliation');
      if (!process.env.RESEND_API_KEY) throw new Error('Email provider unavailable');
      const { data, error: sendError } = await new Resend(process.env.RESEND_API_KEY).emails.send(payloadSchema.parse(delivery.payload), { idempotencyKey: `order-status/${delivery.id}` });
      if (sendError || !data?.id) throw new Error('Email was not accepted');
      const { error: markError } = await deliveries().update({ sent_at: new Date().toISOString(), resend_email_id: data.id }).eq('id', delivery.id).is('sent_at', null);
      if (markError) throw new Error('Email acceptance could not be recorded');
      sent++;
    } catch {
      failed++;
      blocked.add(entry.order_id);
      console.error('[orders] Status email remains queued; retry or reconcile delivery', { deliveryId: entry.id, orderId: entry.order_id });
    }
  }
  return { sent, failed };
}
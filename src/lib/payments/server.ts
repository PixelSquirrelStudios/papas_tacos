import 'server-only';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from '@/lib/supabase/config';

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith('sk_test_')) throw new Error('Stripe test payments are not configured');
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 });
}

export function paymentDatabase() {
  const config = supabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!config || !secret) throw new Error('Payments database is not configured');
  return createClient(config.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function checkoutConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') && process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_') && process.env.SUPABASE_SECRET_KEY);
}
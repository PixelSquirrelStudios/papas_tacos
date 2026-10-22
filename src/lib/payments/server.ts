import 'server-only';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from '@/lib/supabase/config';

export function stripeMode(): 'test' | 'live' {
  const mode = process.env.STRIPE_MODE ?? 'test';
  if (mode !== 'test' && mode !== 'live') throw new Error('STRIPE_MODE must be test or live');
  if (!process.env.STRIPE_SECRET_KEY?.startsWith(`sk_${mode}_`)) {
    throw new Error('Stripe secret key does not match STRIPE_MODE');
  }
  return mode;
}

export function stripeClient() {
  stripeMode();
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2, timeout: 15000 });
}

export function paymentDatabase() {
  const config = supabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!config || !secret) throw new Error('Payments database is not configured');
  return createClient(config.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function checkoutConfigured() {
  try {
    stripeMode();
  } catch {
    console.error('[stripe] Invalid payment mode or mismatched secret key.');
    return false;
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) {
    console.error('[stripe] STRIPE_WEBHOOK_SECRET is missing or does not have the expected prefix.');
    return false;
  }
  if (!process.env.SUPABASE_SECRET_KEY) {
    console.error('[stripe] SUPABASE_SECRET_KEY is missing.');
    return false;
  }
  return true;
}
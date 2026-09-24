import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAccount } from '@/lib/auth/session';
import { createServerSupabase } from '@/lib/supabase/server';
import { checkoutConfigured } from '@/lib/payments/server';
import { CheckoutForm, type CheckoutSlot } from '@/components/bag/checkout-form';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

async function checkoutSlots() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from('pickup_slots')
    .select('id,starts_at,ends_at,events!inner(title,venue_name,is_published,pickup_enabled,ordering_status,orders_open_at,orders_close_at,ends_at,pickup_lead_minutes)')
    .eq('is_enabled', true).eq('events.is_published', true).eq('events.pickup_enabled', true).eq('events.ordering_status', 'open')
    .gt('starts_at', new Date().toISOString()).order('starts_at').limit(200);
  const now = Date.now();
  const slots = ((data ?? []) as unknown as (CheckoutSlot & { events: { orders_open_at: string | null; orders_close_at: string | null; ends_at: string; pickup_lead_minutes: number } })[])
    .filter((slot) => Date.parse(slot.starts_at) > now + (slot.events.pickup_lead_minutes + 32) * 60000
      && (!slot.events.orders_open_at || now >= Date.parse(slot.events.orders_open_at))
      && now < Date.parse(slot.events.orders_close_at || slot.events.ends_at));
  return { slots, error };
}

export default async function CheckoutPage() {
  const viewer = await requireAccount('/checkout');
  const { slots, error } = await checkoutSlots();
  return <main className="page-width py-12 sm:py-16"><h1 className="mb-8 text-3xl font-semibold">Checkout</h1>
    <p className="mb-8 text-sm"><Link href="/account?view=orders" className="text-brand-yellow underline underline-offset-4">View pending orders or cancel an unfinished checkout</Link></p>
    {error || !checkoutConfigured() ? <p role="alert" className="border-l-2 border-primary pl-4">Card checkout is temporarily unavailable.</p>
      : <CheckoutForm slots={slots} name={viewer.profile?.full_name ?? ''} phone={viewer.profile?.phone ?? ''} email={viewer.user.email ?? ''} />}
  </main>;
}
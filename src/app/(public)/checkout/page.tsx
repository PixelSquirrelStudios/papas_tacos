import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAccount } from '@/lib/auth/session';
import { checkoutConfigured } from '@/lib/payments/server';
import { CheckoutForm } from '@/components/bag/checkout-form';
import { getPickupChoices } from '@/lib/payments/pickup';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  const viewer = await requireAccount('/checkout');
  const { slots, error } = await getPickupChoices();
  return <main className="page-width py-12 sm:py-16"><h1 className="mb-8 text-3xl font-semibold">Checkout</h1>
    <p className="mb-8 text-sm"><Link href="/account?view=orders" className="text-brand-yellow underline underline-offset-4">View pending orders or cancel an unfinished checkout</Link></p>
    {error || !checkoutConfigured() ? <p role="alert" className="border-l-2 border-primary pl-4">Card checkout is temporarily unavailable.</p>
      : <CheckoutForm slots={slots} name={viewer.profile?.full_name ?? ''} phone={viewer.profile?.phone ?? ''} email={viewer.user.email ?? ''} />}
  </main>;
}
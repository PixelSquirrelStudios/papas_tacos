import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAccount } from '@/lib/auth/session';
import { checkoutConfigured } from '@/lib/payments/server';
import { CheckoutForm } from '@/components/bag/checkout-form';
import { MenuOrderingProvider } from '@/components/bag/bag-provider';
import { getPickupChoices } from '@/lib/payments/pickup';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const eventId = typeof params.event === 'string' ? params.event : '';
  const next = eventId ? `/checkout?event=${encodeURIComponent(eventId)}` : '/checkout';
  const viewer = await requireAccount(next);
  const { slots, error } = eventId ? await getPickupChoices() : { slots: [], error: false };
  const form = <CheckoutForm eventId={eventId} slots={slots} initialSlotError={Boolean(error)} name={viewer.profile?.full_name ?? ''} phone={viewer.profile?.phone ?? ''} email={viewer.user.email ?? ''} />;
  return <main className="page-width py-12 sm:py-16"><h1 className="mb-8 text-3xl font-semibold">Checkout</h1>
    <p className="mb-8 text-sm"><Link href="/account?view=orders" className="text-brand-yellow underline underline-offset-4">View Pending Orders or Cancel an Unfinished Checkout</Link></p>
    {!checkoutConfigured() ? <p role="alert" className="border-l-2 border-primary pl-4">Card checkout is temporarily unavailable.</p>
      : eventId ? form : <MenuOrderingProvider>{form}</MenuOrderingProvider>}
  </main>;
}
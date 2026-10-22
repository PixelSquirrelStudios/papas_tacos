import type { Metadata } from 'next';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Event Ordering Unavailable', robots: { index: false, follow: false } };

export default async function EventOrderingUnavailablePage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const temporary = reason === 'verification';
  return <main id="main-content" className="page-width py-12 sm:py-16">
    <section aria-labelledby="qr-status-title" className="mx-auto max-w-2xl rounded-lg border border-brand-yellow/25 bg-card p-6 sm:p-10">
      <Info className="mb-5 size-10 text-brand-yellow" aria-hidden="true" />
      <p className="eyebrow text-brand-yellow">Event Ordering</p>
      <h1 id="qr-status-title" className="mt-3 text-3xl font-semibold">{temporary ? 'Please try scanning again' : reason === 'invalid' ? 'This QR link is not valid' : 'This event QR is no longer available'}</h1>
      <p role="status" className="mt-5 leading-relaxed text-muted-foreground">{temporary ? 'We could not verify your QR code right now. Please wait a moment and scan the code again. If the problem continues, speak to our team.' : reason === 'invalid' ? 'Please scan the QR code on the menu provided at the event, or ask our team for help.' : 'Ordering may have finished, or this QR code may no longer be valid. If you are at the event, please ask our team for the current ordering code.'}</p>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Already placed an order? This does not cancel it. Please keep your order number handy and speak to our team if you need an update.</p>
      <div className="mt-7 flex flex-wrap gap-3"><Button asChild><Link href="/events">View Events</Link></Button><Button asChild variant="outline"><Link href="/contact">Contact Us</Link></Button></div>
    </section>
  </main>;
}

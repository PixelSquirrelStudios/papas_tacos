import { Skull } from 'lucide-react';
import { Brand } from '@/components/brand';
import Link from 'next/link';
import { getSettings } from '@/lib/catalogue/data';

export async function SiteFooter() {
  const settings = await getSettings();
  return <footer className="border-t border-border bg-background">
    <div className="page-width flex flex-wrap justify-between gap-8 border-b border-border py-8"><nav aria-label="Footer navigation" className="flex flex-wrap gap-6 text-sm"><Link href="/menu" className="hover:text-primary">Menu &amp; Allergens</Link><Link href="/events" className="hover:text-primary">Find the Truck</Link><Link href="/testimonials" className="hover:text-primary">Testimonials</Link><Link href="/about" className="hover:text-primary">About Papa&apos;s</Link><Link href="/contact" className="hover:text-primary">Contact</Link></nav><div className="flex flex-wrap gap-5 text-sm">{settings?.contact_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contact_email) && <a href={`mailto:${settings.contact_email}`} className="break-all hover:text-primary">{settings.contact_email}</a>}{settings?.contact_phone && /^[+\d\s()\-]+$/.test(settings.contact_phone) && <a href={`tel:${settings.contact_phone.replace(/[^+\d]/g, '')}`} className="hover:text-primary">{settings.contact_phone}</a>}</div></div>
    <div className="mx-auto flex max-w-360 flex-col gap-8 px-5 py-10 sm:px-10 md:flex-row md:items-center md:justify-between lg:px-16">
      <Brand />
      <p className="flex items-center gap-3 text-sm text-muted-foreground"><Skull className="size-5 text-pink" aria-hidden="true" />Mexican soul. Street food spirit. Made fresh.</p>
      <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} Papa&apos;s Tacos. All Rights Reserved.</p>
    </div>
  </footer>;
}
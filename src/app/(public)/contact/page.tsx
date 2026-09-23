import type { Metadata } from 'next';
import { Mail, Phone } from 'lucide-react';
import { ContactForm } from '@/components/catalogue/contact-form';
import { getSettings } from '@/lib/catalogue/data';

export const metadata: Metadata = {
  title: 'Contact',
  description: "Enquire about booking Papa's Tacos for weddings, parties, corporate events and private occasions.",
};

export default async function ContactPage() {
  const settings = await getSettings();

  return <main id="main-content" className="page-width py-12 sm:py-16">
    <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
      <div className="min-w-0">
        <p className="eyebrow text-turquoise">Contact Papa&apos;s</p>
        <h1 className="page-title">GOOD FOOD.<br />GREAT OCCASIONS.</h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">Want Papa&apos;s at your next event? From weddings and parties to corporate events and private bookings, let&apos;s bring a little Papa&apos;s personality to your day.</p>
        <div className="mt-8 space-y-4 text-sm">
          {settings?.contact_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contact_email) && <a href={`mailto:${settings.contact_email}`} className="flex items-start gap-3 text-brand-yellow hover:text-foreground"><Mail className="size-5 shrink-0" aria-hidden="true" /><span className="break-all">{settings.contact_email}</span></a>}
          {settings?.contact_phone && /^[+\d\s()\-]+$/.test(settings.contact_phone) && <a href={`tel:${settings.contact_phone.replace(/[^+\d]/g, '')}`} className="flex items-center gap-3 text-brand-yellow hover:text-foreground"><Phone className="size-5 shrink-0" aria-hidden="true" />{settings.contact_phone}</a>}
        </div>
      </div>
      <ContactForm />
    </div>
  </main>;
}

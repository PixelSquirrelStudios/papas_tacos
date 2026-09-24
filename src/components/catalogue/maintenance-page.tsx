'use client';

import Image from 'next/image';
import { Mail, MessageSquare, Phone, Skull } from 'lucide-react';
import type { Settings } from '@/lib/catalogue/types';
import { httpsLink } from '@/lib/catalogue/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ContactForm } from './contact-form';
import { SocialLinks } from './public-content';

export function MaintenancePage({ settings }: { settings: Settings | null }) {
  const email = settings?.contact_email;
  const phone = settings?.contact_phone;
  return <div className="flex min-h-svh flex-col bg-background text-foreground">
    <main className="relative isolate flex min-h-128 flex-1 items-center overflow-hidden bg-background sm:min-h-140">
      <Image src="/images/tacos_hero.jpg" alt="" fill priority sizes="100vw" className="object-cover object-[65%_center]" />
      <div className="absolute inset-0 bg-black/70" />
      <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-transparent" />
      <div className="page-width relative py-14 sm:py-20">
        <div className="hero-copy mx-auto flex max-w-2xl flex-col items-center text-center">
          <Image src="/images/Papas_Tacos_Logo_Horizontal.svg" alt="Papa's Tacos" width={1110} height={290} priority unoptimized className="mb-8 h-auto w-64 max-w-full sm:w-80" />
          <p className="eyebrow text-turquoise">Temporarily down for maintenance</p>
          <h1 className="font-display text-5xl uppercase leading-tight sm:text-7xl">Papa&apos;s Tacos</h1>
          <h2 className="mt-3 font-display text-4xl uppercase leading-tight text-primary sm:text-6xl">Back online soon.</h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-foreground/80">We&apos;re giving our website a little attention. In the meantime, we&apos;re still here for your event enquiries and taco plans.</p>
          <Dialog><DialogTrigger asChild><Button className="mt-8 h-12 px-7"><MessageSquare aria-hidden="true" />Get in Touch</Button></DialogTrigger><DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Let&apos;s Talk Tacos</DialogTitle><DialogDescription>Tell us about your event and we&apos;ll be in touch.</DialogDescription></DialogHeader><ContactForm /></DialogContent></Dialog>
        </div>
      </div>
    </main>
    <footer className="border-t border-border bg-background">
      <div className="page-width grid gap-8 py-9 md:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:gap-12">
        <div>
          <Image src="/images/Papas_Tacos_Logo_Horizontal.svg" alt="Papa's Tacos" width={1110} height={290} unoptimized className="h-auto w-44 max-w-full" />
          <p className="mt-4 flex max-w-xs items-start gap-3 text-sm leading-relaxed text-muted-foreground"><Skull className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /><span>Mexican soul. Street food spirit.<br />Made fresh.</span></p>
        </div>
        <section aria-label="Contact Papa's Tacos" className="min-w-0">
          <h2 className="mb-3 text-xs font-bold uppercase text-brand-yellow">Let&apos;s Talk Tacos</h2>
          {email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && <a href={`mailto:${email}`} className="flex min-h-11 max-w-full items-center gap-3 text-sm hover:text-brand-yellow"><Mail className="size-4 shrink-0 text-brand-yellow" aria-hidden="true" /><span className="min-w-0 break-all">{email}</span></a>}
          {phone && /^[+\d\s()\-]+$/.test(phone) && <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} className="flex min-h-11 max-w-full items-center gap-3 text-sm hover:text-brand-yellow"><Phone className="size-4 shrink-0 text-brand-yellow" aria-hidden="true" /><span className="min-w-0 break-words">{phone}</span></a>}
        </section>
        {(httpsLink(settings?.instagram_url) || httpsLink(settings?.facebook_url)) && <section aria-label="Follow Papa's Tacos"><h2 className="mb-4 text-xs font-bold uppercase text-brand-yellow">Follow the flavour</h2><SocialLinks settings={settings} /></section>}
      </div>
      <div className="border-t border-border"><div className="page-width py-5"><p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} Papa&apos;s Tacos. All Rights Reserved.</p></div></div>
    </footer>
  </div>;
}
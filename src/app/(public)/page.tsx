import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import { ArrowDown, ArrowUpRight, BriefcaseBusiness, Heart, Mail, PartyPopper, Phone, Skull } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCatalogue, getEvents, getSettings, getTestimonials } from '@/lib/catalogue/data';
import { MenuBrowser } from '@/components/catalogue/menu-browser';
import { EventPreview, ReviewList, SocialLinks } from '@/components/catalogue/public-content';
import { AboutContent } from '@/components/catalogue/about-content';
import { ContactForm } from '@/components/catalogue/contact-form';

export default async function HomePage() {
  const [catalogue, events, settings, testimonials] = await Promise.all([getCatalogue(), getEvents(), getSettings(), getTestimonials()]);
  return <main id="main-content">
    <section className="hero relative isolate overflow-hidden">
      <Image src="/images/tacos_hero.jpg" alt="Tacos topped with fresh salsa, coriander and lime" fill priority sizes="100vw" className="hero-photo object-cover" />
      <div className="hero-shade absolute inset-0 -z-10" />
      <div className="relative mx-auto flex w-full max-w-360 items-center px-5 py-14 sm:px-10 sm:py-16 lg:px-16">
        <div className="hero-copy max-w-xl">
          <p className="mb-6 flex items-center gap-3 text-xs font-bold uppercase text-brand-yellow"><span className="h-px w-8 bg-brand-yellow" />Mexican street food</p>
          <h1 className="font-display text-[76px] leading-[0.98] sm:text-[112px] lg:text-[144px]">PAPA&apos;S<br /><span className="text-primary">TACOS.</span></h1>
          <p className="mt-7 max-w-120 text-lg leading-relaxed text-white/90">Mexican soul. Street food spirit. Made fresh.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="h-12 px-5"><Link href="/menu">Explore the Menu<ArrowUpRight className="size-4" aria-hidden="true" /></Link></Button>
            <Button asChild variant="ghost" size="lg" className="h-12 border border-white/20 bg-white/8 px-5 text-white hover:bg-white/15 hover:text-white dark:hover:bg-white/15"><Link href="/events">Find Us<ArrowUpRight className="size-4" aria-hidden="true" /></Link></Button>
          </div>
        </div>
      </div>
      <div className="absolute right-20 top-20 hidden rotate-12 text-center text-brand-yellow lg:block" aria-hidden="true"><Heart className="mx-auto mb-2 size-12" strokeWidth={1.3} /><p className="font-display text-2xl leading-tight">MADE WITH<br />LOVE</p></div>
    </section>
    <div className="festival-band flex items-center justify-center gap-12 border-y border-border px-3 py-3 text-center text-xs font-bold uppercase sm:flex-wrap sm:gap-x-32 sm:gap-y-4 sm:px-5 sm:py-4 lg:gap-x-48" aria-hidden="true">
      {['Big Flavour', 'Good Company', 'Great Vibes'].map((label) => <span key={label} className="inline-flex min-w-0 items-center justify-center gap-2 text-[10px] leading-tight sm:text-xs"><Skull className="size-5 shrink-0 text-brand-yellow" /><span>{label}</span></span>)}
    </div>
    <AboutContent settings={settings} />
    <section aria-labelledby="papas-choice-title" className="page-width pb-10 pt-16 sm:pt-20"><div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-primary">Handpicked by Papa</p><h2 id="papas-choice-title" className="section-title">Papa&apos;s Choice</h2></div><Button variant="outline" asChild className="h-11"><Link href="/menu">View Full Menu<ArrowUpRight className="size-4" /></Link></Button></div><MenuBrowser initial={catalogue} featured="papas-choice" /></section>
    <section aria-labelledby="crowd-favourites-title" className="page-width pb-16 pt-6 sm:pb-20"><div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-primary">Loved by the crowd</p><h2 id="crowd-favourites-title" className="section-title">Crowd Favourites</h2></div><Button variant="outline" asChild className="h-11"><Link href="/menu">View Full Menu<ArrowUpRight className="size-4" /></Link></Button></div><MenuBrowser initial={catalogue} featured="crowd-favourites" /></section>
    <section id="our-spirit" className="scroll-mt-8 bg-brand-green-deep text-foreground">
      <div className="page-width py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6"><div><p className="eyebrow text-brand-yellow">Your occasion. Papa&apos;s flavour.</p><h2 className="section-title">LET&apos;S MAKE AN EVENT OF IT.</h2></div><Button asChild className="h-12"><a href="#contact">Enquire About Your Event<ArrowDown className="size-4" aria-hidden="true" /></a></Button></div>
        <div className="mt-12 grid gap-0 border-y border-white/20 md:grid-cols-3 md:border-y-0">
          {[{ title: 'Corporate Events', icon: BriefcaseBusiness, copy: 'From team lunches to company celebrations, bring everyone together over bold, freshly made street food.' }, { title: 'Parties', icon: PartyPopper, copy: 'Big birthdays, garden gatherings and just-because celebrations. Bring your people; we’ll bring the flavour.' }, { title: 'Weddings', icon: Heart, copy: 'Make your day your own with feel-good food, from relaxed wedding fiesta feasts to late-night tasty tacos.' }].map(({ title, icon: Icon, copy }, index) => <article key={title} className={`py-8 ${index > 0 ? 'border-t border-white/20 md:border-l md:border-t-0 md:pl-8' : ''} ${index < 2 ? 'md:pr-8' : ''}`}>
            <div className="flex items-center gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-brand-yellow text-brand-green-deep"><Icon className="size-7" strokeWidth={1.8} aria-hidden="true" /></span>
              <h3 className="font-display text-3xl leading-tight">{title}</h3>
            </div>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-white/90">{copy}</p>
          </article>)}
        </div>
      </div>
    </section>
    <section className="border-b border-border bg-background"><div className="page-width py-16 sm:py-20"><div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-turquoise">From the familia</p><h2 className="section-title">LOVE AT FIRST BITE.</h2></div><Button asChild variant="outline" className="h-11"><Link href="/testimonials">All Testimonials<ArrowUpRight className="size-4" /></Link></Button></div><ReviewList reviews={testimonials.reviews.filter((review) => review.is_featured).slice(0, 3)} available={testimonials.available} /></div></section>
    <section className="border-y border-border bg-card"><div className="page-width py-16 sm:py-20"><div className="mb-6 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-pink">Catch us here</p><h2 className="section-title">THE NEXT STOP.</h2></div><Button asChild variant="outline" className="h-11"><Link href="/events">All Events<ArrowUpRight className="size-4" /></Link></Button></div>{events.events[0] ? <EventPreview event={events.events[0]} settings={settings} /> : <p role="status" className="py-8 text-muted-foreground">{events.available ? 'Our next stop will be announced here soon.' : 'Event details are temporarily unavailable.'}</p>}</div></section>
    <section id="contact" aria-labelledby="contact-title" className="scroll-mt-28 border-b border-border bg-background">
      <div className="page-width grid gap-10 py-16 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="min-w-0"><p className="eyebrow text-turquoise">Contact Papa&apos;s</p><h2 id="contact-title" className="section-title">GOOD FOOD.<br />GREAT OCCASIONS.</h2><p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">Want Papa&apos;s at your next event? From weddings and parties to corporate events and private bookings, let&apos;s bring a little Papa&apos;s personality to your day.</p><div className="mt-8 space-y-4 text-sm">{settings?.contact_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contact_email) && <a href={`mailto:${settings.contact_email}`} className="flex items-start gap-3 text-brand-yellow hover:text-foreground"><Mail className="size-5 shrink-0" aria-hidden="true" /><span className="break-all">{settings.contact_email}</span></a>}{settings?.contact_phone && /^[+\d\s()\-]+$/.test(settings.contact_phone) && <a href={`tel:${settings.contact_phone.replace(/[^+\d]/g, '')}`} className="flex items-center gap-3 text-brand-yellow hover:text-foreground"><Phone className="size-5 shrink-0" aria-hidden="true" />{settings.contact_phone}</a>}</div></div>
        <ContactForm />
      </div>
    </section>
    <section aria-labelledby="social-title" className="border-b border-border bg-card"><div className="page-width py-16 sm:py-20"><div className="mb-8 flex flex-wrap items-center justify-between gap-8"><div><p className="eyebrow text-primary">Stay in the loop</p><h2 id="social-title" className="section-title">A LITTLE MORE PAPA&apos;S.</h2></div><SocialLinks settings={settings} /></div><div className="min-w-0"><div className="elfsight-app-e2c3ec3f-f6cd-45bd-bc52-0811f7bb1787" data-elfsight-app-lazy="" /></div><Script src="https://elfsightcdn.com/platform.js" strategy="lazyOnload" /></div></section>
  </main>;
}
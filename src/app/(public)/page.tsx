import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import { ArrowUpRight, Flower2, Heart, Skull } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCatalogue, getEvents, getSettings, getTestimonials } from '@/lib/catalogue/data';
import { MenuBrowser } from '@/components/catalogue/menu-browser';
import { EventPreview, ReviewList, SocialLinks } from '@/components/catalogue/public-content';

export default async function HomePage() {
  const [catalogue, events, settings, testimonials] = await Promise.all([getCatalogue(), getEvents(), getSettings(), getTestimonials()]);
  return <main id="main-content">
    <section className="hero relative isolate overflow-hidden">
      <Image src="/images/tacos_hero.jpg" alt="Tacos topped with fresh salsa, coriander and lime" fill priority sizes="100vw" className="hero-photo object-cover" />
      <div className="hero-shade absolute inset-0 -z-10" />
      <div className="relative mx-auto flex w-full max-w-[1440px] items-center px-5 py-14 sm:px-10 sm:py-16 lg:px-16">
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
      {['Big Flavour', 'Good Company', 'Great Vibes'].map((label) => <span key={label} className={`${label === 'Good Company' ? 'hidden sm:inline-flex' : 'inline-flex'} min-w-0 items-center justify-center gap-1 text-[10px] leading-tight sm:gap-2 sm:text-xs`}><Skull className="size-5 shrink-0 text-brand-yellow" /><span>{label}</span></span>)}
    </div>
    <section aria-labelledby="papas-choice-title" className="page-width pb-10 pt-16 sm:pt-20"><div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-primary">Handpicked by Papa</p><h2 id="papas-choice-title" className="section-title">Papa&apos;s Choice</h2></div><Button variant="outline" asChild className="h-11"><Link href="/menu">View Full Menu<ArrowUpRight className="size-4" /></Link></Button></div><MenuBrowser initial={catalogue} featured="papas-choice" /></section>
    <section aria-labelledby="crowd-favourites-title" className="page-width pb-16 pt-6 sm:pb-20"><p className="eyebrow text-primary">Loved by the crowd</p><h2 id="crowd-favourites-title" className="section-title mb-8">Crowd Favourites</h2><MenuBrowser initial={catalogue} featured="crowd-favourites" /></section>
    <section id="our-spirit" className="scroll-mt-8 bg-brand-green-deep text-foreground">
      <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-16 sm:px-10 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-16 lg:px-16 lg:py-20">
        <div><p className="mb-4 text-xs font-bold uppercase">The Papa&apos;s spirit</p><h2 className="font-display text-4xl leading-tight sm:text-5xl">A LITTLE MEXICO.<br />A LOT OF HEART.</h2></div>
        <div className="max-w-md"><Heart className="mb-5 size-8" strokeWidth={1.5} aria-hidden="true" /><p className="text-lg leading-relaxed">Tacos, good company and a little extra salsa. That&apos;s our kind of gathering.</p><p className="mt-4 leading-relaxed">Mexican-inspired street food, right here in the UK. Come hungry. Leave happy.</p></div>
      </div>
    </section>
    <section className="page-width py-16 sm:py-20"><div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-turquoise">From the familia</p><h2 className="section-title">LOVE AT FIRST BITE.</h2></div><Button asChild variant="outline" className="h-11"><Link href="/testimonials">All Testimonials<ArrowUpRight className="size-4" /></Link></Button></div><ReviewList reviews={testimonials.reviews.filter((review) => review.is_featured).slice(0, 3)} available={testimonials.available} /></section>
    <section className="border-y border-border bg-card"><div className="page-width py-16 sm:py-20"><div className="mb-6 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-pink">Catch us here</p><h2 className="section-title">THE NEXT STOP.</h2></div><Button asChild variant="outline" className="h-11"><Link href="/events">All Events<ArrowUpRight className="size-4" /></Link></Button></div>{events.events[0] ? <EventPreview event={events.events[0]} settings={settings} /> : <p role="status" className="py-8 text-muted-foreground">{events.available ? 'Our next stop will be announced here soon.' : 'Event details are temporarily unavailable.'}</p>}</div></section>
    <section aria-labelledby="social-title" className="page-width py-16 sm:py-20"><div className="mb-8 flex flex-wrap items-center justify-between gap-8"><div><p className="eyebrow text-primary">Stay in the loop</p><h2 id="social-title" className="section-title">A LITTLE MORE PAPA&apos;S.</h2></div><SocialLinks settings={settings} /></div><div className="min-w-0"><div className="elfsight-app-e2c3ec3f-f6cd-45bd-bc52-0811f7bb1787" data-elfsight-app-lazy="" /></div><Script src="https://elfsightcdn.com/platform.js" strategy="lazyOnload" /></section>
  </main>;
}
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Clock3, MapPin, Quote, Star, Truck, UtensilsCrossed } from 'lucide-react';
import { siFacebook, siInstagram } from 'simple-icons';
import { Button } from '@/components/ui/button';
import type { Settings, Testimonial, TruckEvent } from '@/lib/catalogue/types';
import { eventDate, eventTime, httpsLink, pickupState } from '@/lib/catalogue/format';

function EventDateBlock({ startsAt }: { startsAt: string }) {
  const date = new Date(startsAt);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric' }).format(date);
  const month = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', month: 'short' }).format(date);
  const year = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric' }).format(date);
  return <time dateTime={startsAt} aria-label={eventDate(startsAt)} className="flex w-18 shrink-0 flex-col items-center rounded-md border border-brand-yellow/25 bg-brand-yellow/10 px-2 py-3 text-brand-yellow"><span className="text-xs font-bold uppercase">{month}</span><span className="my-1 text-3xl font-semibold leading-none">{day}</span><span className="text-xs">{year}</span></time>;
}

export function EventPreview({ event, settings, detail = false }: { event: TruckEvent; settings: Settings | null; detail?: boolean }) {
  const map = httpsLink(event.map_url) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venue_name} ${event.address_line_1} ${event.town} ${event.postcode}`)}`;
  if (detail) return <article aria-label={event.title} className="mt-8 grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
    <div className="min-w-0">{event.imageUrl ? <Image src={event.imageUrl} alt={event.image_alt || event.title} width={1200} height={1600} unoptimized sizes="(max-width: 1024px) 100vw, 45vw" className="h-auto w-full object-contain" /> : <div className="grid aspect-[3/4] place-items-center bg-muted text-turquoise"><Truck className="size-20" strokeWidth={1} aria-label="Event image unavailable" /></div>}</div>
    <div className="min-w-0 space-y-8">
      <aside aria-label="Plan Your Visit" className="min-w-0"><h2 className="mb-6 text-2xl font-semibold">Plan Your Visit</h2><dl className="grid gap-6 sm:grid-cols-2">
        <div><dt className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-brand-yellow"><CalendarDays className="size-4" aria-hidden="true" />Date &amp; Time</dt><dd className="text-sm leading-relaxed"><time dateTime={event.starts_at}>{eventDate(event.starts_at)}</time><span className="mt-1 block">{eventTime(event.starts_at)} - {eventTime(event.ends_at)}</span>{eventDate(event.starts_at) !== eventDate(event.ends_at) && <span className="block text-muted-foreground">Until {eventDate(event.ends_at)}</span>}</dd></div>
        <div><dt className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-brand-yellow"><MapPin className="size-4" aria-hidden="true" />Find Us</dt><dd className="break-words text-sm leading-relaxed"><span className="font-semibold">{event.venue_name}</span><span className="mt-1 block text-muted-foreground">{event.address_line_1}{event.address_line_2 && <><br />{event.address_line_2}</>}<br />{event.town}, {event.postcode}</span></dd></div>
      </dl><div className="mt-6 border-t border-border pt-5"><p className="flex items-start gap-2 text-sm font-medium text-turquoise"><Truck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{pickupState(event, settings)}</span></p>{(settings?.ordering_message || event.ordering_message) && <p className="mt-2 text-sm text-muted-foreground">{settings?.ordering_status !== 'open' ? settings?.ordering_message : event.ordering_message}</p>}<div className="mt-5 flex flex-wrap gap-3"><Button asChild className="min-h-11"><Link href="/menu"><UtensilsCrossed className="size-4" />Browse Menu</Link></Button><Button variant="outline" asChild className="min-h-11"><a href={map} target="_blank" rel="noopener noreferrer"><MapPin className="size-4" />Directions<ArrowUpRight className="size-4" /></a></Button></div></div></aside>
      <section aria-label="About This Stop" className="min-w-0 border-t border-border pt-8"><p className="eyebrow text-brand-yellow">The gathering</p><h2 className="mb-5 text-2xl font-semibold">About This Stop</h2>{event.description ? <p className="whitespace-pre-line break-words leading-relaxed text-muted-foreground">{event.description}</p> : <p className="text-muted-foreground">Join us at {event.venue_name} for Papa&apos;s Tacos.</p>}<Link href="/events" className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-yellow">All Events<ArrowUpRight className="size-4" aria-hidden="true" /></Link></section>
    </div>
  </article>;
  return <article aria-label={event.title} className="mb-6 grid min-w-0 overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
    <div className="relative aspect-[4/3] overflow-hidden bg-muted lg:aspect-auto lg:min-h-80">{event.imageUrl ? <Image src={event.imageUrl} alt={event.image_alt || event.title} fill unoptimized sizes="(max-width: 1024px) 100vw, 45vw" className="object-cover" /> : <div className="absolute inset-0 grid place-items-center text-turquoise"><Truck className="size-20" strokeWidth={1} aria-label="Event image unavailable" /></div>}
    </div>
    <div className="flex min-w-0 flex-col p-5 sm:p-7">
      <div className="flex items-start gap-4"><EventDateBlock startsAt={event.starts_at} /><div className="min-w-0"><h3 className="break-words text-xl font-semibold leading-tight sm:text-2xl">{event.title}</h3><dl className="mt-4"><div><dt className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-brand-yellow"><Clock3 className="size-4 shrink-0" aria-hidden="true" />Serving Times</dt><dd className="text-sm font-medium">{eventTime(event.starts_at)} - {eventTime(event.ends_at)}{eventDate(event.starts_at) !== eventDate(event.ends_at) && <span className="mt-1 block text-muted-foreground">Until {eventDate(event.ends_at)}</span>}</dd></div></dl></div></div>
      <dl className="my-5 border-y border-border py-5">
        <div className="min-w-0"><dt className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-brand-yellow"><MapPin className="size-4" aria-hidden="true" />Find Us</dt><dd className="break-words text-sm leading-relaxed"><span className="font-semibold">{event.venue_name}</span><span className="mt-1 block text-muted-foreground">{event.address_line_1}{event.address_line_2 && <>, {event.address_line_2}</>}<br />{event.town}, {event.postcode}</span></dd></div>
      </dl>
      {event.description && <p className="mb-5 line-clamp-3 whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">{event.description}</p>}
      <div className="mt-auto border-t border-border pt-4"><p className="flex items-start gap-2 text-sm font-medium text-turquoise"><Truck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{pickupState(event, settings)}</span></p>{(settings?.ordering_message || event.ordering_message) && <p className="mt-2 text-sm text-muted-foreground">{settings?.ordering_status !== 'open' ? settings?.ordering_message : event.ordering_message}</p>}
        <div className="mt-5 flex flex-wrap gap-3"><Button asChild className="min-h-11"><Link href={`/events/${event.slug}`}>Event Details<ArrowUpRight className="size-4" /></Link></Button><Button variant="outline" asChild className="min-h-11"><a href={map} target="_blank" rel="noopener noreferrer"><MapPin className="size-4" />Directions<ArrowUpRight className="size-4" /></a></Button></div>
      </div>
    </div>
  </article>;
}

export function ReviewList({ reviews, available }: { reviews: Testimonial[]; available: boolean }) {
  if (!available) return <p role="status" className="py-8 text-muted-foreground">Reviews are temporarily unavailable.</p>;
  if (!reviews.length) return <p className="py-8 text-muted-foreground">More words from our customers soon.</p>;
  return <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{reviews.map((review) => <figure key={review.id} className="min-w-0 rounded-lg border border-border p-6">{review.imageUrl ? <Image src={review.imageUrl} alt={review.image_alt || review.author_name} width={64} height={64} unoptimized className="mb-5 size-16 rounded-full object-cover" /> : <Quote className="mb-5 size-8 text-pink" strokeWidth={1.3} aria-hidden="true" />}{review.rating !== null && <div className="mb-4 flex gap-1 text-primary" aria-label={`${review.rating} out of 5 stars`}>{Array.from({ length: review.rating }, (_, index) => <Star key={index} className="size-4 fill-current" aria-hidden="true" />)}</div>}<blockquote className="whitespace-pre-line break-words leading-relaxed">{review.body}</blockquote><figcaption className="mt-6 text-sm font-semibold">{review.author_name}{review.source_name && <span className="mt-1 block text-xs font-normal text-muted-foreground">{httpsLink(review.source_url) ? <a href={httpsLink(review.source_url)!} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{review.source_name}</a> : review.source_name}</span>}</figcaption></figure>)}</div>;
}

export function SocialLinks({ settings }: { settings: Settings | null }) {
  const instagram = httpsLink(settings?.instagram_url);
  const facebook = httpsLink(settings?.facebook_url);
  return <div className="flex flex-wrap gap-4">{instagram && <Button variant="outline" asChild className="h-12"><a href={instagram} target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true"><path d={siInstagram.path} /></svg>Instagram<ArrowUpRight className="size-4" /></a></Button>}{facebook && <Button variant="outline" asChild className="h-12"><a href={facebook} target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true"><path d={siFacebook.path} /></svg>Facebook<ArrowUpRight className="size-4" /></a></Button>}{!instagram && !facebook && <Button variant="outline" asChild className="h-12"><Link href="/events">Find Our Next Stop<ArrowUpRight className="size-4" /></Link></Button>}</div>;
}
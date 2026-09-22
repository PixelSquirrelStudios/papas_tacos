import { notFound } from 'next/navigation';
import { getEvent, getSettings } from '@/lib/catalogue/data';
import { EventPreview } from '@/components/catalogue/public-content';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const event = await getEvent((await params).slug);
  return { title: event?.title || 'Event' };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const [event, settings] = await Promise.all([getEvent((await params).slug), getSettings()]);
  if (!event) notFound();
  return <main id="main-content" className="page-width py-12 sm:py-16"><p className="eyebrow text-pink">Papa&apos;s on the road</p><h1 className="page-title break-words">{event.title}</h1><EventPreview event={event} settings={settings} detail /></main>;
}
import type { Metadata } from 'next';
import { getEvents, getSettings } from '@/lib/catalogue/data';
import { EventPreview } from '@/components/catalogue/public-content';

export const metadata: Metadata = { title: 'Find the Truck' };

export default async function EventsPage() {
  const [data, settings] = await Promise.all([getEvents(), getSettings()]);
  data.events.sort((first, second) => first.sort_order - second.sort_order || Date.parse(first.starts_at) - Date.parse(second.starts_at) || first.id.localeCompare(second.id));
  return <main id="main-content" className="page-width py-12 sm:py-16"><p className="eyebrow text-pink">Out on the road</p><h1 className="page-title">FIND THE TRUCK.</h1><p className="mb-8 mt-4 text-muted-foreground">Our upcoming stops, served with a little Mexican soul.</p>{data.events.map((event) => <EventPreview key={event.id} event={event} settings={settings} />)}{!data.events.length && <p role="status" className="border-y border-border py-12 text-muted-foreground">{data.available ? 'Our next stop will be announced here soon.' : 'Event details are temporarily unavailable. Please check back shortly.'}</p>}</main>;
}
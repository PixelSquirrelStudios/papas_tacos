import { getCatalogue, getEvents, getSettings } from '@/lib/catalogue/data';

export async function GET() {
  const [catalogue, settings, events] = await Promise.all([getCatalogue(), getSettings(), getEvents()]);
  return Response.json({ catalogue, settings, events: events.events }, { headers: { 'Cache-Control': 'no-store' } });
}
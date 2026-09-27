import { getCatalogue, getEvents, getSettings, getMaintenanceMode } from '@/lib/catalogue/data';
import { getViewer } from '@/lib/auth/session';

export async function GET() {
  const maintenance = await getMaintenanceMode();
  if (maintenance !== false && !(maintenance === true && (await getViewer())?.profile?.role === 'admin')) {
    return Response.json({ error: 'The site is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
  const [catalogue, settings, events] = await Promise.all([getCatalogue(), getSettings(), getEvents()]);
  return Response.json({ catalogue, settings, events: events.events }, { headers: { 'Cache-Control': 'private, no-store' } });
}
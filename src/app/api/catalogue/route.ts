import { getCatalogue, getEvents, getSettings, getMaintenanceMode } from '@/lib/catalogue/data';
import { getViewer } from '@/lib/auth/session';
import { checkEventAccess, savedEventAccess } from '@/lib/event-access';

export async function GET() {
  const maintenance = await getMaintenanceMode();
  if (maintenance !== false && !(maintenance === true && (await getViewer())?.profile?.role === 'admin')) {
    return Response.json({ error: 'The site is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
  const [catalogue, settings, events] = await Promise.all([getCatalogue(), getSettings(), getEvents()]);
  try {
    const accessibleEvents = await Promise.all(events.events.map(async (event) => {
      if (!event.is_private) return event;
      const key = await savedEventAccess(event.id);
      return { ...event, ordering_access: Boolean(key && await checkEventAccess(event.id, key)) };
    }));
    return Response.json({ catalogue, settings, events: accessibleEvents }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    console.error('[events] Catalogue event access verification unavailable');
    return Response.json({ error: 'Event ordering access could not be checked. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
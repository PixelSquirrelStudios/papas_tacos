import type { Settings, TruckEvent } from './types';

export function choiceLabel(value: string) {
  return value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function publicImageUrl(path: string | null, storageOrigin: string | null) {
  if (!path) return null;
  try {
    const url = new URL(path);
    if (url.origin === 'https://images.unsplash.com' && !url.username && !url.password && /^\/photo-[a-zA-Z0-9-]+$/.test(url.pathname)) return url.href;
    return null;
  } catch {
    if (!storageOrigin || !/^[a-zA-Z0-9_/-]+\.(jpg|jpeg|png|webp|avif)$/i.test(path) || path.includes('..') || path.startsWith('/')) return null;
    const storagePath = path.startsWith('images/') ? path : `public-media/${path}`;
    return `${storageOrigin}/storage/v1/object/public/${storagePath}`;
  }
}

export function eventDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}

export function eventTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function pickupState(event: TruckEvent, settings: Settings | null, now = Date.now()) {
  if (!settings || settings.maintenance_enabled || settings.ordering_status === 'closed') return 'Pickup orders closed';
  if (settings.ordering_status === 'paused') return 'Pickup orders paused';
  if (!event.pickup_enabled) return 'No pickup orders at this event';
  if (event.ordering_status === 'closed') return 'Pickup orders closed';
  if (event.ordering_status === 'paused') return 'Pickup orders paused';
  if (event.orders_open_at && now < Date.parse(event.orders_open_at)) return 'Pickup orders open later';
  if (now >= Date.parse(event.orders_close_at || event.ends_at)) return 'Pickup orders ended';
  return 'Pickup enabled for this event';
}

export function canOrder(events: TruckEvent[], settings: Settings | null, now = Date.now()) {
  return settings?.maintenance_enabled !== true && settings?.ordering_status === 'open' && events.some((event) => {
    const opens = Date.parse(event.orders_open_at || event.starts_at);
    const closes = Math.min(Date.parse(event.ends_at), Date.parse(event.orders_close_at || event.ends_at));
    return event.pickup_enabled && event.ordering_status === 'open' && now >= opens && now < closes;
  });
}

export function httpsLink(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
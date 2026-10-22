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

export function servingWindow(event: Pick<TruckEvent, 'starts_at' | 'ends_at' | 'orders_open_at' | 'orders_close_at'>) {
  return { opens: event.orders_open_at || event.starts_at, closes: event.orders_close_at || event.ends_at };
}

export function pickupState(event: TruckEvent, settings: Settings | null, now = Date.now()) {
  if (event.service_mode && event.service_mode !== 'pickup') {
    const label = event.service_mode === 'table' ? 'Table Service' : 'Car Service';
    if (canOrder([event], settings, now)) return `${label} Orders Open`;
    if (!event.pickup_enabled) return `${label} Ordering Unavailable`;
    if (!settings || settings.ordering_status === 'closed' || event.ordering_status === 'closed') return `${label} Orders Closed`;
    if (settings?.ordering_status === 'paused' || event.ordering_status === 'paused') return `${label} Orders Paused`;
    const opens = event.orders_open_at || event.starts_at;
    if (now < Date.parse(opens)) return `Ordering is not open yet. You can place ${event.service_mode === 'car' ? 'car' : 'table'} delivery orders from ${eventTime(opens)} on ${eventDate(opens)}.`;
    return `${label} Orders Closed`;
  }
  if (!settings || settings.ordering_status === 'closed') return 'Pickup Orders Closed';
  if (settings.ordering_status === 'paused') return 'Pickup Orders Paused';
  if (!event.pickup_enabled) return 'No Pickup Orders at This Event';
  if (event.ordering_status === 'closed') return 'Pickup Orders Closed';
  if (event.ordering_status === 'paused') return 'Pickup Orders Paused';
  if (event.orders_open_at && now < Date.parse(event.orders_open_at)) return 'Pickup Orders Open Later';
  if (now >= Date.parse(event.orders_close_at || event.ends_at)) return 'Pickup Orders Ended';
  return 'Pickup Enabled for This Event';
}

export function canOrder(events: TruckEvent[], settings: Settings | null, now = Date.now()) {
  return settings?.ordering_status === 'open' && events.some((event) => {
    const window = servingWindow(event);
    const opens = Date.parse(window.opens);
    const closes = Date.parse(window.closes);
    return (!event.is_private || event.ordering_access === true) && event.pickup_enabled && event.ordering_status === 'open' && now >= opens && now < closes;
  });
}

export function eventOrderingNotice(event: TruckEvent, settings: Settings | null, now = Date.now()) {
  const window = servingWindow(event);
  if (!settings) return { title: 'Ordering Unavailable', message: 'We cannot check ordering availability right now. Please try again shortly.' };
  if (!event.pickup_enabled) return { title: 'Ordering Unavailable', message: 'Online ordering is not available for this event. Please speak to our team.' };
  if (settings.ordering_status === 'closed' || event.ordering_status === 'closed' || now >= Date.parse(window.closes)) return { title: 'Orders Closed', message: 'We are no longer accepting orders for this event. Thank you for visiting us. If you have already ordered, our team will still look after your order.' };
  if (settings.ordering_status === 'paused' || event.ordering_status === 'paused') return { title: 'Orders Paused', message: 'We have temporarily paused new orders. Please check back shortly. If you have already ordered, our team will still look after your order.' };
  if (now < Date.parse(window.opens)) return { title: 'Orders Open Later', message: `Ordering is not open yet. You can place orders from ${eventTime(window.opens)} on ${eventDate(window.opens)}. You are welcome to browse the menu while you wait.` };
  if (event.is_private && !event.ordering_access) return { title: 'Scan Event QR to Order', message: 'Please scan the QR code provided at this event to unlock ordering.' };
  return null;
}

export function httpsLink(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
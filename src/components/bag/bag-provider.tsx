'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { lineKey, mergeLine, parseBag, type BagLine } from '@/lib/bag';
import type { Catalogue, Settings, TruckEvent } from '@/lib/catalogue/types';
import { canOrder } from '@/lib/catalogue/format';
import { catalogueRequestEvent, catalogueUpdateEvent, siteUpdateEvent } from '@/lib/site-updates';
import { EventOrderingInfo } from '@/components/catalogue/event-ordering-info';
import { Button } from '@/components/ui/button';
import { menuCatalogue } from '@/lib/catalogue/menu-sets';

const storageKey = 'papas-tacos:bag:v1';
type BagContextValue = {
  lines: BagLine[]; ready: boolean; storageError: boolean; catalogue: Catalogue; settings: Settings | null; orderingOpen: boolean;
  sourceCatalogue: Catalogue;
  collectionEvents: TruckEvent[];
  events: TruckEvent[]; selectedEventId: string; selectedEvent?: TruckEvent;
  selectEvent: (id: string) => void;
  add: (line: BagLine, replacing?: string, eventId?: string) => void; setQuantity: (key: string, quantity: number) => void; remove: (key: string) => void;
  clearIfMatches: (purchased: BagLine[]) => void;
};
const BagContext = createContext<BagContextValue | null>(null);

export function BagProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<BagLine[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [data, setData] = useState<{ catalogue: Catalogue; settings: Settings | null; events?: TruckEvent[] }>({ catalogue: { items: [], categories: [], available: false }, settings: null });
  const [now, setNow] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState('');
  const selectedEvent = data.events?.find((event) => event.id === selectedEventId);
  const catalogue = menuCatalogue(data.catalogue, selectedEvent?.menu_set_id);
  const eligibleEvents = selectedEventId ? (selectedEvent ? [selectedEvent] : []) : (data.events ?? []).filter(isPublicPickupEvent);
  const orderingOpen = catalogue.available && canOrder(eligibleEvents, data.settings, now);
  const collectionEvents = (data.events ?? []).filter((event) => canOrder([event], data.settings, now));

  useEffect(() => {
    const current = Date.now();
    const boundaries = (data.events ?? []).flatMap((event) => [event.orders_open_at || event.starts_at, event.orders_close_at || event.ends_at, event.ends_at]).map(Date.parse).filter((time) => time > current);
    const timer = window.setTimeout(() => setNow(Date.now()), now === 0 ? 0 : Math.min(60000, ...boundaries.map((time) => time - current + 1)));
    return () => window.clearTimeout(timer);
  }, [data, now]);

  useEffect(() => {
    const controller = new AbortController();
    let refreshing = false;
    let refreshQueued = false;
    let snapshot = '';
    async function refresh() {
      if (controller.signal.aborted || document.visibilityState === 'hidden' || location.pathname.startsWith('/admin')) return;
      if (refreshing) { refreshQueued = true; return; }
      refreshing = true;
      const request = new AbortController();
      const timeout = window.setTimeout(() => request.abort(), 12000);
      try {
        const response = await fetch('/api/catalogue', { cache: 'no-store', signal: AbortSignal.any([controller.signal, request.signal]) });
        if (!response.ok) throw new Error('Catalogue unavailable');
        const next = await response.json();
        if (controller.signal.aborted || request.signal.aborted) return;
        const serialized = JSON.stringify(next);
        const changed = snapshot !== '' && snapshot !== serialized;
        snapshot = serialized;
        setData(next);
        setNow(Date.now());
        if (changed) window.dispatchEvent(new Event(catalogueUpdateEvent));
      } catch {
        if (!controller.signal.aborted) setData((previous) => ({ catalogue: { ...previous.catalogue, available: false }, settings: null }));
      } finally {
        window.clearTimeout(timeout);
        refreshing = false;
        if (refreshQueued && !controller.signal.aborted) { refreshQueued = false; void refresh(); }
      }
    }
    async function hydrate() {
      let stored: BagLine[] = [];
      let storedEvent = '';
      let failed = false;
      try { stored = parseBag(localStorage.getItem(storageKey)); } catch { failed = true; }
      try { storedEvent = localStorage.getItem('papas-tacos:event') || ''; } catch { failed = true; }
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLines(stored); setSelectedEventId(storedEvent); setStorageError(failed); setReady(true);
    }
    function syncStorage(event: StorageEvent) {
      if (event.key === storageKey || event.key === null) setLines(parseBag(event.newValue));
      if (event.key === 'papas-tacos:event' || event.key === null) setSelectedEventId(event.key === null ? '' : event.newValue || '');
    }
    void hydrate(); void refresh();
    window.addEventListener('storage', syncStorage);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener(siteUpdateEvent, refresh);
    window.addEventListener(catalogueRequestEvent, refresh);
    document.addEventListener('visibilitychange', refresh);
    const interval = window.setInterval(refresh, 15000);
    return () => {
      controller.abort();
      window.removeEventListener('storage', syncStorage);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener(siteUpdateEvent, refresh);
      window.removeEventListener(catalogueRequestEvent, refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(interval);
    };
  }, []);

  function save(next: BagLine[]) {
    setLines(next);
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, lines: next })); setStorageError(false); }
    catch { setStorageError(true); }
  }
  function add(line: BagLine, replacing?: string, eventId = selectedEventId) {
    const events = eventId ? (data.events ?? []).filter((event) => event.id === eventId) : (data.events ?? []).filter(isPublicPickupEvent);
    const target = (data.events ?? []).find((event) => event.id === eventId);
    const menu = menuCatalogue(data.catalogue, target?.menu_set_id);
    if (!menu.available || !canOrder(events, data.settings, Date.now()) || !menu.items.some((item) => item.id === line.itemId && item.is_available)) return;
    if (eventId !== selectedEventId) selectEvent(eventId);
    save(mergeLine(replacing ? lines.filter((candidate) => lineKey(candidate) !== replacing) : lines, line));
  }
  function setQuantity(key: string, quantity: number) {
    if (quantity < 1 || quantity > 99 || !Number.isInteger(quantity)) return;
    save(lines.map((line) => lineKey(line) === key ? { ...line, quantity } : line));
  }
  function clearIfMatches(purchased: BagLine[]) {
    if (purchased.length === lines.length && lines.every((line) => purchased.some((saved) => lineKey(saved) === lineKey(line) && saved.quantity === line.quantity))) save([]);
  }
  function selectEvent(id: string) {
    setSelectedEventId(id);
    try { localStorage.setItem('papas-tacos:event', id); } catch { setStorageError(true); }
  }
  return <BagContext.Provider value={{ lines, ready, storageError, ...data, catalogue, sourceCatalogue: data.catalogue, events: data.events ?? [], selectedEventId, selectedEvent, selectEvent, orderingOpen, collectionEvents, add, setQuantity, clearIfMatches, remove: (key) => save(lines.filter((line) => lineKey(line) !== key)) }}>{children}</BagContext.Provider>;
}

function isPublicPickupEvent(event: TruckEvent) {
  return !event.is_private && (!event.service_mode || event.service_mode === 'pickup');
}

export function MenuOrderingProvider({ eventId = '', children }: { eventId?: string; children: React.ReactNode }) {
  const bag = useBag();
  const [pending, setPending] = useState<{ line: BagLine; replacing?: string } | null>(null);
  const [error, setError] = useState('');
  const selectedEvent = bag.events.find((event) => event.id === eventId);
  const catalogue = menuCatalogue(bag.sourceCatalogue, selectedEvent?.menu_set_id);
  const events = eventId ? (selectedEvent ? [selectedEvent] : []) : bag.events.filter(isPublicPickupEvent);
  const orderingOpen = catalogue.available && canOrder(events, bag.settings);
  function commit(line: BagLine, replacing?: string) {
    if (!catalogue.available || !canOrder(events, bag.settings) || !catalogue.items.some((item) => item.id === line.itemId && item.is_available)) {
      setError('Ordering availability has changed. Please review the current ordering information before trying again.');
      return;
    }
    setError('');
    bag.add(line, replacing, eventId);
    setPending(null);
  }
  const value: BagContextValue = {
    ...bag, catalogue, selectedEventId: eventId, selectedEvent, orderingOpen,
    collectionEvents: events.filter((event) => canOrder([event], bag.settings)),
    add(line, replacing) {
      if (bag.lines.length && bag.selectedEventId !== eventId) setPending({ line, replacing });
      else commit(line, replacing);
    },
  };
  return <BagContext.Provider value={value}>
    {eventId && bag.ready && <section aria-label="Ordering Event" className="my-6 space-y-3">
      {selectedEvent ? <><h2 className="text-xl font-semibold">Ordering for {selectedEvent.title}</h2><EventOrderingInfo event={selectedEvent} settings={bag.settings} /></> : <p role="alert" className="rounded-lg border border-brand-yellow/25 bg-brand-yellow/5 p-4 text-sm">This event is closed, expired or unavailable. Please check the event link or speak to our team. You can still browse the menu.</p>}
    </section>}
    {error && <p role="alert" className="my-4 text-sm text-destructive">{error}</p>}
    {pending && <section role="alert" aria-label="Switch Ordering Context" className="my-6 space-y-3 rounded-lg border border-brand-yellow/25 bg-card p-4">
      <p>Your bag is currently for {bag.selectedEvent?.title || (bag.selectedEventId ? 'another event' : 'public pickup')}. Switch it to {selectedEvent?.title || 'public pickup ordering'} and add this item? Your existing items will be kept and availability will be checked again.</p>
      <div className="flex flex-wrap gap-3"><Button onClick={() => commit(pending.line, pending.replacing)}>Switch and Add Item</Button><Button variant="outline" onClick={() => setPending(null)}>Keep Current Bag</Button></div>
    </section>}
    {children}
  </BagContext.Provider>;
}

export function PaidOrderBagCleanup({ orderId }: { orderId: string }) {
  const bag = useContext(BagContext);
  useEffect(() => {
    if (!bag?.ready) return;
    try {
      const attempt = JSON.parse(sessionStorage.getItem('papas-tacos:checkout') || 'null');
      if (attempt?.orderId !== orderId || typeof attempt.serialized !== 'string') return;
      const input = JSON.parse(attempt.serialized);
      const purchased = parseBag(JSON.stringify({ version: 1, lines: input.lines }));
      sessionStorage.removeItem('papas-tacos:checkout');
      if (purchased.length) bag.clearIfMatches(purchased);
    } catch {}
  }, [bag, orderId]);
  return null;
}

export function useBag() {
  const context = useContext(BagContext);
  if (!context) throw new Error('BagProvider is required.');
  return context;
}

export function useOrderingOpen() {
  return useContext(BagContext)?.orderingOpen ?? false;
}
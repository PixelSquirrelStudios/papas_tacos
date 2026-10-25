'use client';

import { useEffect, useState } from 'react';
import { publicStockSchema, type PublicStock } from '@/lib/inventory';
import { catalogueRequestEvent, siteUpdateEvent } from '@/lib/site-updates';

export function useStock(eventId: string, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<{ eventId: string; stock: PublicStock; available: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let refreshing = false;
    async function refresh() {
      if (controller.signal.aborted || refreshing || document.visibilityState === 'hidden' || location.pathname.startsWith('/admin')) return;
      refreshing = true;
      try {
        const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
        const response = await fetch(`/api/stock${query}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw new Error('Stock availability could not be checked.');
        const result = await response.json();
        const stock = publicStockSchema.parse(result.stock);
        if (!controller.signal.aborted) setSnapshot({ eventId, stock, available: true });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('[stock] Availability refresh failed', error);
          setSnapshot({ eventId, stock: [], available: false });
        }
      } finally { refreshing = false; }
    }
    void refresh();
    const events = ['focus', 'online', 'pageshow', siteUpdateEvent, catalogueRequestEvent];
    for (const event of events) window.addEventListener(event, refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      controller.abort();
      for (const event of events) window.removeEventListener(event, refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
  }, [eventId, enabled]);
  return enabled && snapshot?.eventId === eventId ? snapshot : null;
}

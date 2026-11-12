'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import { useBag } from './bag-provider';
import { EventOrderingInfo } from '@/components/catalogue/event-ordering-info';
import { Button } from '@/components/ui/button';

export function EventSelection({ requestedEventId, disabled = false }: { requestedEventId: string; disabled?: boolean }) {
  const { events, selectedEvent, selectedEventId, selectEvent, settings, ready, lines } = useBag();
  const requestedEvent = events.find((event) => event.id === requestedEventId);
  const handled = useRef<string | null>(null);
  const applyRequestedEvent = useEffectEvent(() => {
    if (!ready || handled.current === requestedEventId) return;
    handled.current = requestedEventId;
    if (selectedEventId === requestedEventId || lines.length) return;
    selectEvent(requestedEventId);
  });
  useEffect(() => { applyRequestedEvent(); }, [ready, requestedEventId]);
  if (!ready) return null;
  if (selectedEventId !== requestedEventId && lines.length > 0) {
    return <section aria-label="Ordering Event" role="alert" className="my-6 space-y-3 rounded-lg border border-brand-yellow/30 bg-brand-yellow/5 p-4">
      <p className="text-sm">Your bag is for {selectedEvent?.title || (selectedEventId ? 'another event' : 'delivery ordering')}. Switch it to {requestedEventId ? requestedEvent?.title || 'the event from this link' : 'delivery ordering'} before checkout.</p>
      <Button type="button" disabled={disabled} onClick={() => selectEvent(requestedEventId)}>Switch Ordering Context</Button>
    </section>;
  }
  if (!requestedEventId) return null;
  if (!selectedEvent) return <section aria-label="Ordering Event" role="alert" className="my-6 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
    This event is unavailable. Check the event link or speak to our team.
  </section>;
  return <section aria-label="Ordering Event" className="my-6 space-y-3 rounded-lg border border-turquoise/30 bg-turquoise/5 p-4">
    <h2 className="text-lg font-semibold">Ordering for {selectedEvent.title}</h2>
    <EventOrderingInfo event={selectedEvent} settings={settings} />
  </section>;
}

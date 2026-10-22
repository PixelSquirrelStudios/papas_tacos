'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useBag } from './bag-provider';
import { EventOrderingInfo } from '@/components/catalogue/event-ordering-info';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function EventSelection({ requestedEventId, disabled = false }: { requestedEventId?: string; disabled?: boolean }) {
  const { events, selectedEvent, selectedEventId, selectEvent, settings, ready, lines } = useBag();
  const handled = useRef('');
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const applyRequestedEvent = useEffectEvent(() => {
    if (!ready || handled.current === (requestedEventId || '')) return;
    handled.current = requestedEventId || '';
    if (!requestedEventId) return;
    if (selectedEventId && selectedEventId !== requestedEventId && lines.length) setSwitchTo(requestedEventId);
    else selectEvent(requestedEventId);
  });
  // Synchronize each incoming event link with the persistent bag after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { applyRequestedEvent(); }, [ready, requestedEventId]);
  if (!ready) return null;
  const proposed = events.find((event) => event.id === switchTo);
  return <section aria-label="Ordering Event" className="my-6 space-y-3 rounded-lg border border-turquoise/30 bg-turquoise/5 p-4">
    <Label htmlFor="ordering-event">Ordering for</Label>
    <select id="ordering-event" value={selectedEventId} disabled={disabled} className="h-12 w-full rounded-md border bg-background px-3 text-sm" onChange={(event) => {
      if (lines.length && event.target.value !== selectedEventId) setSwitchTo(event.target.value);
      else selectEvent(event.target.value);
    }}>
      <option value="">Choose a pickup event or table/car service</option>
      {selectedEventId && !selectedEvent && <option value={selectedEventId}>Selected event is no longer available</option>}
      {events.map((event) => <option key={event.id} value={event.id} disabled={event.is_private && !event.ordering_access}>{event.title} ({event.service_mode === 'table' ? 'Table service' : event.service_mode === 'car' ? 'Car service' : 'Pickup'}{event.is_private && !event.ordering_access ? ' - scan event QR to order' : ''})</option>)}
    </select>
    {selectedEvent ? <EventOrderingInfo event={selectedEvent} settings={settings} />
      : selectedEventId ? <p role="alert" className="text-sm text-destructive">This event is closed, expired or unavailable. Choose another event explicitly to continue.</p> : <p className="text-sm text-muted-foreground">For table or car delivery, select your event before ordering.</p>}
    {switchTo !== null && <div role="alert" className="space-y-3 border-t pt-3"><p className="text-sm">Switch your bag to {proposed?.title || (switchTo ? 'the event from this link' : 'pickup event selection')}? Your items will be kept; availability will be checked again.</p><div className="flex flex-wrap gap-3"><Button type="button" disabled={disabled} onClick={() => { selectEvent(switchTo); setSwitchTo(null); }}>Switch Event</Button><Button type="button" variant="outline" disabled={disabled} onClick={() => setSwitchTo(null)}>Keep Current Event</Button></div></div>}
  </section>;
}

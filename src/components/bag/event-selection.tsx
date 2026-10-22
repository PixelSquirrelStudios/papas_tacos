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
  const locked = selectedEventId && (!selectedEvent || selectedEvent.service_mode === 'car' || selectedEvent.service_mode === 'table' || selectedEvent.is_private || selectedEvent.menu_set_id);
  return <section aria-label="Ordering Event" className="my-6 space-y-3 rounded-lg border border-turquoise/30 bg-turquoise/5 p-4">
    {locked ? <h2 className="text-lg font-semibold">{selectedEvent ? `Ordering for ${selectedEvent.title}` : 'Selected Event Unavailable'}</h2> : <><Label htmlFor="ordering-event">Ordering For</Label>
    <select id="ordering-event" value={selectedEventId} disabled={disabled} className="h-12 w-full rounded-md border bg-background px-3 text-sm" onChange={(event) => {
      if (lines.length && event.target.value !== selectedEventId) setSwitchTo(event.target.value);
      else selectEvent(event.target.value);
    }}>
      <option value="">Choose a Pickup Event or Table/Car Service</option>
      {selectedEventId && !selectedEvent && <option value={selectedEventId}>Selected Event Is No Longer Available</option>}
      {events.map((event) => <option key={event.id} value={event.id} disabled={event.is_private && !event.ordering_access}>{event.title} ({event.service_mode === 'table' ? 'Table Service' : event.service_mode === 'car' ? 'Car Service' : 'Pickup'}{event.is_private && !event.ordering_access ? ' - Scan Event QR to Order' : ''})</option>)}
    </select></>}
    {selectedEvent ? <EventOrderingInfo event={selectedEvent} settings={settings} />
      : selectedEventId ? <p role="alert" className="text-sm text-destructive">This event is closed, expired or unavailable. Please check the event link or speak to our team.</p> : <p className="text-sm text-muted-foreground">For table or car delivery, select your event before ordering.</p>}
    {switchTo !== null && <div role="alert" className="space-y-3 border-t pt-3"><p className="text-sm">Switch your bag to {proposed?.title || (switchTo ? 'the event from this link' : 'pickup event selection')}? Your items will be kept; availability will be checked again.</p><div className="flex flex-wrap gap-3"><Button type="button" disabled={disabled} onClick={() => { selectEvent(switchTo); setSwitchTo(null); }}>Switch Event</Button><Button type="button" variant="outline" disabled={disabled} onClick={() => setSwitchTo(null)}>Keep Current Event</Button></div></div>}
  </section>;
}

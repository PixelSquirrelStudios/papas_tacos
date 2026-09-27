'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, ChevronDown, CircleCheck, CircleSlash, Clock3, LockKeyhole, MapPin, Pause, Pencil, Plus, TicketCheck, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RecordEditor } from './record-editor';
import { lockPickupSlot } from '@/app/admin/actions';
import { eventDate, eventTime } from '@/lib/catalogue/format';
import { pickupLabel, type PickupChoice } from '@/lib/pickup';
import { notifySiteUpdated } from '@/lib/site-updates';
import type { AdminRow } from '@/lib/admin/resources';

const slotStyles = {
  available: { Icon: CircleCheck, colour: 'text-turquoise', surface: 'border-turquoise/30 border-l-turquoise bg-turquoise/5 hover:bg-turquoise/10' },
  taken: { Icon: TicketCheck, colour: 'text-sky-400', surface: 'border-sky-400/20 border-l-sky-400 bg-sky-400/5' },
  locked: { Icon: LockKeyhole, colour: 'text-brand-yellow', surface: 'border-brand-yellow/25 border-l-brand-yellow bg-brand-yellow/5 hover:bg-brand-yellow/10' },
  unavailable: { Icon: Clock3, colour: 'text-muted-foreground', surface: 'border-border border-l-muted-foreground/40 bg-muted/20 hover:bg-muted/40' },
};

export function PickupManager({ events, schedules, slots }: { events: AdminRow[]; schedules: AdminRow[]; slots: PickupChoice[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(events[0]?.id ?? '');
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [expandedDays, setExpandedDays] = useState<string[]>([]);
  const slotListId = useId();
  const event = events.find((entry) => entry.id === selected) ?? events[0];
  const schedule = schedules.find((entry) => entry.event_id === event?.id);
  const choices = slots.filter((slot) => slot.event_id === event?.id);
  const eligible = events.filter((entry) => entry.pickup_enabled && entry.ordering_status === 'open');
  const canEdit = eligible.some((entry) => entry.id === event?.id);
  return <main className="min-w-0 p-4 sm:p-8">
    <h1 className="mb-6 text-2xl font-semibold">Pickup Slots</h1>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <nav aria-label="Pickup Events" className="flex min-w-0 flex-col gap-3">
        {events.map((entry) => {
          const selectedEvent = entry.id === event?.id;
          const eventSchedule = schedules.find((row) => row.event_id === entry.id);
          const startsAt = entry.starts_at || eventSchedule?.starts_at;
          const venue = String(entry.venue_name ?? '').trim();
          const title = String(entry.title).trim();
          const open = entry.pickup_enabled && entry.ordering_status === 'open';
          const paused = entry.pickup_enabled && entry.ordering_status === 'paused';
          const StatusIcon = open ? CircleCheck : paused ? Pause : CircleSlash;
          return <button key={entry.id} type="button" disabled={pending} aria-pressed={selectedEvent} onClick={() => { setSelected(entry.id!); setError(''); }} className={`min-w-0 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default ${selectedEvent ? 'border-turquoise/60 bg-turquoise/5' : 'border-border bg-card hover:border-muted-foreground/50'}`}>
            <span className="flex items-start justify-between gap-3"><span className="min-w-0 font-semibold leading-snug wrap-anywhere">{title}</span><ArrowRight aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${selectedEvent ? 'text-turquoise' : 'text-muted-foreground/40'}`} /></span>
            {venue && venue.toLocaleLowerCase() !== title.toLocaleLowerCase() && <span className="mt-2 flex items-start gap-2 text-xs text-muted-foreground"><MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /><span className="wrap-anywhere">{venue}</span></span>}
            {Boolean(startsAt) && <span className="mt-2 flex items-start gap-2 text-xs text-muted-foreground"><CalendarDays aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /><span>{eventDate(String(startsAt))}</span></span>}
            <span className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs font-medium"><span className={`inline-flex items-center gap-1.5 ${open ? 'text-turquoise' : paused ? 'text-brand-yellow' : 'text-muted-foreground'}`}><StatusIcon aria-hidden="true" className="size-3.5" />{open ? 'Open' : paused ? 'Paused' : entry.pickup_enabled ? 'Closed' : 'Pickup Disabled'}</span><span className="text-muted-foreground">{eventSchedule ? `${slots.filter((slot) => slot.event_id === entry.id).length} slots` : 'Not Scheduled'}</span></span>
          </button>;
        })}
        {!events.length && <p className="text-sm text-muted-foreground">No events yet.</p>}
      </nav>
      {event && <section aria-label="Pickup Times" className="min-w-0 lg:border-l lg:pl-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-xl font-semibold">Collection Times</h2>{schedule && <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Timer aria-hidden="true" className="size-4 text-brand-yellow" />{String(schedule.preparation_minutes)} min preparation</p>}</div>
          <Button disabled={!canEdit || pending} onClick={() => setEditing(true)}>{schedule ? <Pencil /> : <Plus />}{schedule ? 'Edit Schedule' : 'Set Schedule'}</Button>
        </div>
        {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
        {!choices.length && <p className="text-sm text-muted-foreground">No pickup times scheduled.</p>}
        {[...new Set(choices.map((slot) => eventDate(slot.starts_at)))].map((date, dateIndex) => {
          const dayKey = `${event.id}:${date}`;
          const expanded = expandedDays.includes(dayKey);
          const dayChoices = choices.filter((slot) => eventDate(slot.starts_at) === date);
          const controlsId = `${slotListId}-${dateIndex}`;
          return <div key={date} className="mb-6"><h3 className="mb-3 text-sm font-semibold">
            <span className="hidden items-center gap-2 lg:flex"><CalendarDays aria-hidden="true" className="size-4 text-brand-yellow" />{date}</span>
            <button type="button" aria-expanded={expanded} aria-controls={controlsId} aria-label={`${expanded ? 'Hide' : 'Show'} pickup times for ${date}`} onClick={() => setExpandedDays((current) => expanded ? current.filter((key) => key !== dayKey) : [...current, dayKey])} className="flex min-h-14 w-full items-center gap-3 border-y py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
              <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-brand-yellow" /><span className="min-w-0 flex-1">{date}<span className="mt-1 block text-xs font-normal text-muted-foreground">{dayChoices.length} slots</span></span><ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          </h3>
          <div id={controlsId} className={`grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2.5 ${expanded ? 'grid' : 'hidden lg:grid'}`}>{dayChoices.map((slot) => {
            const { Icon, colour, surface } = slotStyles[slot.status];
            return <button key={slot.id} type="button" disabled={pending || slot.status === 'taken'} aria-pressed={slot.status === 'locked'} aria-label={`${slot.status === 'locked' ? 'Unlock' : 'Lock'} ${eventTime(slot.starts_at)}, ${pickupLabel(slot.status)}`} title={slot.status === 'taken' ? 'Taken' : slot.status === 'locked' ? 'Unlock pickup time' : 'Lock pickup time'} onClick={() => startTransition(async () => {
            setError('');
            try {
              const result = await lockPickupSlot(slot.id, slot.updated_at, slot.status !== 'locked');
              if (!result.ok) setError(result.error || 'Unable to update pickup time.');
              else notifySiteUpdated();
            } catch { setError('Unable to update pickup time. Try again.'); }
            router.refresh();
          })} className={`flex h-24 min-w-0 flex-col justify-center gap-3 rounded-md border border-l-[3px] px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default ${surface}`}>
            <span className="flex items-center gap-1.5 tabular-nums"><span className="text-base font-semibold">{eventTime(slot.starts_at)}</span><ArrowRight aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" /><span className="text-xs text-muted-foreground">{eventTime(slot.ends_at)}</span></span>
            <span className={`flex items-center gap-1.5 text-xs font-medium ${colour}`}><Icon aria-hidden="true" className="size-3.5 shrink-0" />{pickupLabel(slot.status)}</span>
          </button>;
          })}</div>
        </div>;
        })}
      </section>}
    </div>
    {editing && <RecordEditor resourceKey="slots" row={schedule ?? null} initialValues={{ event_id: event?.id }} references={{ events: eligible }} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); notifySiteUpdated(); router.refresh(); }} />}
  </main>;
}
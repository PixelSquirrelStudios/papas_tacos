'use client';

import { useRef, useState, type FormEvent } from 'react';
import { CalendarDays, CircleCheck, LoaderCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { eventTypes } from '@/lib/contact/enquiry';

export function ContactForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [eventDate, setEventDate] = useState<Date>();
  const [dateOpen, setDateOpen] = useState(false);
  const submission = useRef<{ payload: string; requestId: string } | null>(null);
  const busy = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const payload = JSON.stringify(values);
    if (submission.current?.payload !== payload) submission.current = { payload, requestId: crypto.randomUUID() };
    busy.current = true;
    setPending(true); setSent(false); setError(''); setFields({});
    try {
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, requestId: submission.current.requestId }) });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setError(result.error || 'Your enquiry could not be sent. Please try again.');
        setFields(result.fields || {});
        return;
      }
      setSent(true); form.reset(); setEventDate(undefined); submission.current = null;
    } catch { setError('Unable to send your enquiry. Check your connection and try again.'); }
    finally { busy.current = false; setPending(false); }
  }

  function fieldError(name: string) {
    return fields[name] ? <p id={`contact-${name}-error`} className="text-sm text-destructive">{fields[name]}</p> : null;
  }
  function accessibility(name: string) {
    return { id: `contact-${name}`, name, 'aria-invalid': Boolean(fields[name]), 'aria-describedby': fields[name] ? `contact-${name}-error` : undefined };
  }

  return <form onSubmit={submit} className="min-w-0" aria-label="Event booking enquiry" aria-busy={pending}>
    <fieldset disabled={pending} className="grid min-w-0 gap-5 sm:grid-cols-2">
      <div className="space-y-2"><label htmlFor="contact-name" className="text-sm font-semibold">Your Name *</label><Input {...accessibility('name')} placeholder="Your name" autoComplete="name" required minLength={2} maxLength={120} className="h-12" />{fieldError('name')}</div>
      <div className="space-y-2"><label htmlFor="contact-email" className="text-sm font-semibold">Email Address *</label><Input {...accessibility('email')} placeholder="you@example.com" type="email" autoComplete="email" required maxLength={254} className="h-12" />{fieldError('email')}</div>
      <div className="space-y-2"><label htmlFor="contact-phone" className="text-sm font-semibold">Phone Number</label><Input {...accessibility('phone')} placeholder="e.g. 07700 900123" type="tel" autoComplete="tel" maxLength={40} className="h-12" />{fieldError('phone')}</div>
      <div className="space-y-2"><label htmlFor="contact-eventType" className="text-sm font-semibold">Event Type *</label><Select name="eventType" required><SelectTrigger {...accessibility('eventType')} className="h-12! w-full cursor-pointer bg-background text-base hover:border-brand-yellow data-[state=open]:border-brand-yellow"><SelectValue placeholder="Select an Event Type" /></SelectTrigger><SelectContent position="popper" align="start" className="border-brand-yellow/50">{eventTypes.map((type) => <SelectItem key={type} value={type} className="cursor-pointer focus:bg-[#c99150] focus:text-background data-[state=checked]:bg-brand-yellow data-[state=checked]:text-background">{type}</SelectItem>)}</SelectContent></Select>{fieldError('eventType')}</div>
      <div className="space-y-2"><label htmlFor="contact-eventDate" className="text-sm font-semibold">Event Date</label><Popover open={dateOpen} onOpenChange={setDateOpen}><PopoverTrigger asChild><Button id="contact-eventDate" type="button" variant="outline" aria-invalid={Boolean(fields.eventDate)} aria-describedby={fields.eventDate ? 'contact-eventDate-error' : undefined} className="h-12 w-full cursor-pointer justify-between bg-background px-3 text-base font-normal hover:border-brand-yellow hover:bg-background hover:text-foreground data-[state=open]:border-brand-yellow"><span className={eventDate ? 'text-foreground' : 'text-muted-foreground'}>{eventDate ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(eventDate) : 'Choose a date'}</span><CalendarDays className="size-4 text-brand-yellow" aria-hidden="true" /></Button></PopoverTrigger><PopoverContent align="start" className="w-auto border-brand-yellow/50 bg-popover p-0"><Calendar mode="single" selected={eventDate} onSelect={(date) => { setEventDate(date); if (date) setDateOpen(false); }} disabled={{ before: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) }} defaultMonth={eventDate} /></PopoverContent></Popover><input type="hidden" name="eventDate" value={eventDate ? `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}` : ''} />{fieldError('eventDate')}</div>
      <div className="space-y-2"><label htmlFor="contact-guests" className="text-sm font-semibold">Number of Guests</label><Input {...accessibility('guests')} placeholder="e.g. 100" type="number" min={1} max={10000} step={1} className="h-12" />{fieldError('guests')}</div>
      <div className="space-y-2 sm:col-span-2"><label htmlFor="contact-location" className="text-sm font-semibold">Venue or Area *</label><Input {...accessibility('location')} placeholder="Venue name, town or postcode" required minLength={2} maxLength={300} className="h-12" />{fieldError('location')}</div>
      <div className="space-y-2 sm:col-span-2"><label htmlFor="contact-message" className="text-sm font-semibold">Tell Us About Your Event *</label><Textarea {...accessibility('message')} placeholder="Tell us what you are planning..." required minLength={10} maxLength={5000} rows={5} className="min-h-36 resize-y" />{fieldError('message')}</div>
      <div hidden aria-hidden="true"><label htmlFor="contact-website">Website</label><input id="contact-website" name="website" tabIndex={-1} autoComplete="off" maxLength={200} /></div>
    </fieldset>
    {error && <p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}
    {sent && <div role="status" className="mt-5 flex items-start gap-3 border-l-2 border-turquoise pl-4 text-sm leading-relaxed"><CircleCheck className="mt-0.5 size-5 shrink-0 text-turquoise" aria-hidden="true" /><p>Thanks! Your enquiry has been sent. We will be in touch to discuss your event. Your booking is not confirmed yet.</p></div>}
    <Button type="submit" disabled={pending} className="mt-6 h-12 w-full">{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}{pending ? 'Sending Enquiry...' : 'Send Enquiry'}</Button>
  </form>;
}
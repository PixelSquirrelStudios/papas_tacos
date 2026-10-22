import { Clock3, Info, QrCode, Truck } from 'lucide-react';
import type { Settings, TruckEvent } from '@/lib/catalogue/types';
import { eventDate, eventTime, eventOrderingNotice, pickupState, servingWindow } from '@/lib/catalogue/format';
import { serviceDeliveryMessage } from '@/lib/service-ordering';

export function EventOrderingInfo({ event, settings }: { event: TruckEvent; settings: Settings | null }) {
  const service = event.service_mode === 'car' || event.service_mode === 'table';
  const locked = event.is_private && !event.ordering_access;
  const serving = servingWindow(event);
  const additionalNotes = settings?.ordering_status !== 'open' ? settings?.ordering_message : event.ordering_message;
  const notice = eventOrderingNotice({ ...event, ordering_access: true }, settings);
  return <section aria-label="Ordering Information" className="space-y-3 rounded-lg border border-turquoise/25 bg-turquoise/5 p-4 text-sm">
    {notice && <div role="status" className="rounded-md border border-brand-yellow/25 bg-brand-yellow/5 p-3"><p className="flex items-center gap-2 font-semibold text-brand-yellow"><Info className="size-4 shrink-0" aria-hidden="true" />{notice.title}</p><p className="mt-2 leading-relaxed text-muted-foreground">{notice.message}</p></div>}
    {locked && <p className="flex items-start gap-2 font-medium"><QrCode className="mt-0.5 size-4 shrink-0 text-turquoise" aria-hidden="true" />Orders can only be placed by scanning a QR code provided at the event.</p>}
    {service ? <><p className="flex items-center gap-2 font-semibold text-turquoise"><Info className="size-4 shrink-0" aria-hidden="true" />{event.service_mode === 'car' ? 'Delivery to Your Car' : 'Delivery to Your Table'}</p><p className="leading-relaxed text-muted-foreground">{serviceDeliveryMessage(event.service_mode === 'car' ? 'car' : 'table')}</p></>
      : <p className="flex items-start gap-2 font-medium text-turquoise"><Truck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{pickupState(event, settings)}</p>}
    <div role="note" aria-label="Orders Accepted" className="flex items-start gap-3 rounded-md border border-brand-yellow/25 bg-brand-yellow/5 p-3">
      <Clock3 className="mt-0.5 size-5 shrink-0 text-brand-yellow" aria-hidden="true" />
      <div className="min-w-0"><p className="font-semibold text-brand-yellow">Orders Accepted:</p><p className="mt-1 leading-relaxed text-muted-foreground">{eventDate(serving.opens)} - {eventTime(serving.opens)} - {eventTime(serving.closes)}{eventDate(serving.opens) !== eventDate(serving.closes) ? ` until ${eventDate(serving.closes)}` : ''}</p></div>
    </div>
    {service && <p className="text-muted-foreground">{event.service_mode === 'car' ? 'Enter your assigned car number when ordering. You can also add your number plate to help us find you.' : 'Enter your table number when ordering so we can bring your food to you.'}</p>}
    {additionalNotes && <section aria-label="Additional Notes" className="space-y-2 border-t border-border pt-3"><h4 className="font-semibold text-foreground">Additional Notes</h4><p className="whitespace-pre-line leading-relaxed text-muted-foreground">{additionalNotes}</p></section>}
  </section>;
}

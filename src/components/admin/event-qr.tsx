'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';

export function EventQr({ id, title }: { id: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const endpoint = `/api/admin/events/${id}/qr`;
  return <Dialog><DialogTrigger asChild><Button type="button" variant="outline" onClick={() => setFailed(false)}>Ordering QR Code</Button></DialogTrigger><DialogContent className="max-h-[calc(100svh-2rem)] max-w-sm gap-6 overflow-y-auto"><DialogHeader className="gap-4 text-left"><DialogTitle className="pr-6 leading-snug">{title}: Ordering QR</DialogTitle><DialogDescription className="rounded-lg border border-border bg-muted/40 p-4 leading-relaxed">Print this event-specific code on the menus given out at the event. For private events it unlocks ordering, so only share it with attendees. Ordering still respects opening times.</DialogDescription></DialogHeader>
    {failed ? <p role="alert" className="text-sm text-destructive">Unable to generate the QR code. Check your connection and SITE_URL configuration, then reopen this dialog.</p> : <Image src={endpoint} alt={`Ordering QR code for ${title}`} width={256} height={256} unoptimized className="mx-auto h-auto max-w-full bg-white" onError={() => setFailed(true)} />}
    {!failed && <Button asChild><a href={`${endpoint}?download=1`}>Download QR (SVG)</a></Button>}
  </DialogContent></Dialog>;
}

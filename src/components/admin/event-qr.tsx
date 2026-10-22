'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';

export function EventQr({ id, title }: { id: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const endpoint = `/api/admin/events/${id}/qr`;
  return <Dialog><DialogTrigger asChild><Button type="button" variant="outline" onClick={() => setFailed(false)}>Ordering QR Code</Button></DialogTrigger><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{title}: Ordering QR</DialogTitle><DialogDescription>Print this event-specific code on the menus given out at the event. For private events it unlocks ordering, so only share it with attendees. Ordering still respects opening times.</DialogDescription></DialogHeader>
    {failed ? <p role="alert" className="text-sm text-destructive">Unable to generate the QR code. Check your connection and SITE_URL configuration, then reopen this dialog.</p> : <Image src={endpoint} alt={`Ordering QR code for ${title}`} width={256} height={256} unoptimized className="mx-auto bg-white" onError={() => setFailed(true)} />}
    <a href={`${endpoint}?open=1`} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-turquoise underline">Open Event Menu</a>
    {!failed && <Button asChild><a href={`${endpoint}?download=1`}>Download QR (SVG)</a></Button>}
  </DialogContent></Dialog>;
}

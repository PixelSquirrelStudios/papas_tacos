'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { restockOrder } from '@/app/admin/stock/actions';
import { notifySiteUpdated } from '@/lib/site-updates';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function OrderStock({ orderId, canRestock, restored }: { orderId: string; canRestock: boolean; restored: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  return <section className="my-6 rounded-lg border p-4"><h2 className="font-semibold">Cancelled Order Stock</h2>
    <p className="mt-2 text-sm text-muted-foreground">{restored ? 'The tracked stock for this order has been restored. It cannot be restored twice.' : 'Unpaid checkout holds are released automatically. Confirmed sales stay depleted when cancelled or refunded, because food may already be prepared. Only restore stock that can actually be sold again.'}</p>
    {canRestock && <Button variant="outline" className="mt-4" onClick={() => setOpen(true)}><PackagePlus />Restore Reusable Stock</Button>}
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}><DialogContent showCloseButton={!pending}><DialogHeader><DialogTitle>Restore This Order&apos;s Stock?</DialogTitle><DialogDescription>This restores all tracked items from the order once. Do not use this if only some items are reusable: leave the order depleted and make item-by-item corrections in Stock instead. Refunds are handled separately.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        if (!reason.trim() || pending) return;
        setError('');
        startTransition(async () => {
          try {
            const result = await restockOrder({ orderId, reason });
            if (!result.ok) { setError(result.error ?? 'Stock restoration failed.'); return; }
            toast.success('Order stock restored');
            setOpen(false); notifySiteUpdated(); router.refresh();
          } catch { setError('The result could not be confirmed. Refresh this order before retrying.'); }
        });
      }}><div className="space-y-2"><Label htmlFor="restock-reason">Reason (Required)</Label><Textarea id="restock-reason" required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={pending || !reason.trim()}>{pending && <LoaderCircle className="animate-spin" />}Restore Stock</Button></div>
      </form>
    </DialogContent></Dialog>
  </section>;
}

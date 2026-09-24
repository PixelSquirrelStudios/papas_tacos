'use client';

import { useEffect, useEffectEvent, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, LoaderCircle, Power, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { setMaintenanceMode, setOrderingStatus, updateOrder } from '@/app/admin/actions';
import { orderOperations } from '@/lib/admin/orders';
import type { AdminRow } from '@/lib/admin/resources';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';

export function AdminRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refresh = useEffectEvent(() => {
    if (!pending && document.visibilityState === 'visible' && !document.querySelector('[role="dialog"], [role="alertdialog"], [data-admin-editing="true"]')) startTransition(() => router.refresh());
  });
  useEffect(() => {
    const update = () => refresh();
    const timer = setInterval(update, 15000);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); window.removeEventListener('online', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  return null;
}

export function OnlineOrderingControl({ status, updatedAt }: { status: string; updatedAt?: string }) {
  const router = useRouter();
  const [current, setCurrent] = useOptimistic(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const open = current === 'open';
  return <section aria-labelledby="online-ordering-title" className={`min-w-0 border-y border-l-4 px-5 py-5 sm:px-6 ${open ? 'border-turquoise/40 bg-brand-green-deep/20' : 'border-brand-yellow/40 bg-brand-yellow/5'}`}>
    <div className="flex flex-wrap items-center justify-between gap-5">
      <div className="flex min-w-0 items-center gap-4"><Power className={`size-7 shrink-0 ${open ? 'text-turquoise' : 'text-brand-yellow'}`} aria-hidden="true" /><div><h2 id="online-ordering-title" className="text-sm font-medium text-muted-foreground">Online Ordering</h2><p role="status" className={`mt-1 text-2xl font-semibold ${open ? 'text-turquoise' : 'text-brand-yellow'}`}>{pending ? 'Updating...' : current === 'open' ? 'Open for Orders' : current === 'paused' ? 'Orders Paused' : 'Orders Closed'}</p></div></div>
      <div className="flex min-h-11 items-center gap-4"><span className="text-sm font-semibold">{open ? 'Open' : current === 'paused' ? 'Paused' : 'Closed'}</span><Switch aria-label="Online Ordering" aria-describedby={error ? 'ordering-error' : undefined} checked={open} disabled={pending || !updatedAt} className="data-[size=default]:h-6 data-[size=default]:w-11 data-[state=checked]:bg-turquoise [&_[data-slot=switch-thumb]]:size-5 [&_[data-state=checked]]:translate-x-5" onCheckedChange={(checked) => {
        if (!updatedAt) return;
        setError('');
        startTransition(async () => {
          setCurrent(checked ? 'open' : 'closed');
          try {
            const result = await setOrderingStatus(checked ? 'open' : 'closed', updatedAt);
            if (!result.ok) setError(result.error ?? 'Unable to update ordering.');
            else toast.success(checked ? 'Online ordering opened' : 'Online ordering closed');
          } catch { setError('Unable to update ordering. Please try again.'); }
          router.refresh();
        });
      }} />{pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}</div>
    </div>
    {!updatedAt && <p role="alert" className="mt-3 text-sm text-muted-foreground">Ordering settings are unavailable.</p>}
    {error && <p id="ordering-error" role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </section>;
}

export function MaintenanceControl({ enabled, updatedAt }: { enabled?: boolean; updatedAt?: string }) {
  const router = useRouter();
  const [current, setCurrent] = useOptimistic(enabled ?? false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const available = typeof enabled === 'boolean' && Boolean(updatedAt);
  return <section aria-labelledby="maintenance-title" className={`min-w-0 border-y border-l-4 px-5 py-5 sm:px-6 ${current ? 'border-pink/40 bg-pink/5' : 'border-border'}`}>
    <div className="flex flex-wrap items-center justify-between gap-5">
      <div className="flex min-w-0 items-center gap-4"><Wrench className="size-7 shrink-0 text-pink" aria-hidden="true" /><div><h2 id="maintenance-title" className="text-sm font-medium text-muted-foreground">Maintenance Mode</h2><p role="status" className="mt-1 text-2xl font-semibold">{pending ? 'Updating...' : current ? 'Maintenance Page Active' : 'Website Live'}</p></div></div>
      <div className="flex min-h-11 items-center gap-4"><span className="text-sm font-semibold">{current ? 'On' : 'Off'}</span><Switch aria-label="Maintenance Mode" aria-describedby={error ? 'maintenance-error' : undefined} checked={current} disabled={pending || !available} className="data-[size=default]:h-6 data-[size=default]:w-11 data-[state=checked]:bg-pink [&_[data-slot=switch-thumb]]:size-5 [&_[data-state=checked]]:translate-x-5" onCheckedChange={(checked) => {
        if (!updatedAt) return;
        setError('');
        startTransition(async () => {
          setCurrent(checked);
          try {
            const result = await setMaintenanceMode(checked, updatedAt);
            if (!result.ok) setError(result.error ?? 'Unable to update maintenance mode.');
            else toast.success(checked ? 'Maintenance mode enabled' : 'Website is live');
          } catch { setError('Unable to update maintenance mode. Please try again.'); }
          router.refresh();
        });
      }} />{pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}</div>
    </div>
    {!available && <p role="alert" className="mt-3 text-sm text-muted-foreground">Maintenance settings are unavailable. Apply the maintenance database migration and reload.</p>}
    {error && <p id="maintenance-error" role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </section>;
}

export function OrderControls({ order }: { order: AdminRow }) {
  const router = useRouter();
  const [operation, setOperation] = useState<{ value: string; label: string } | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  return <><div className="flex flex-wrap gap-3">{orderOperations(String(order.status), String(order.payment_method), String(order.payment_status)).map((action) => <Button key={action.value} variant={action.value === 'cancelled' ? 'outline' : 'default'} onClick={() => { setError(''); setReason(''); setOperation(action); }}><Check />{action.label}</Button>)}</div><AlertDialog open={Boolean(operation)} onOpenChange={(open) => { if (!open && !pending) setOperation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{operation?.label}?</AlertDialogTitle><AlertDialogDescription>Order #{String(order.order_number)}{operation?.value === 'cash_paid' ? ': confirm the cash has been received.' : operation?.value === 'cancelled' ? '. Cancellation does not issue a card refund. Review any paid amount separately with your payment provider.' : '. This updates the order status.'}</AlertDialogDescription></AlertDialogHeader>{operation?.value === 'cancelled' && <div className="space-y-2"><Label htmlFor="cancel-reason">Cancellation Reason</Label><Textarea id="cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={pending} /></div>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={pending}>Back</AlertDialogCancel><Button disabled={pending || (operation?.value === 'cancelled' && !reason.trim())} onClick={() => startTransition(async () => { if (!operation) return; try { const result = await updateOrder(order.id!, operation.value, reason); if (!result.ok) setError(result.error ?? 'Update failed.'); else { toast.success('Order updated'); setOperation(null); router.refresh(); } } catch { setError('Unable to update the order. Try again.'); } })}>{pending ? 'Updating...' : 'Confirm'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
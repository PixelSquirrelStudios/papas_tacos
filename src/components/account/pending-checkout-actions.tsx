'use client';

import { useState, useTransition } from 'react';
import { CreditCard, LoaderCircle, X } from 'lucide-react';
import { cancelCheckout, resumeCheckout } from '@/app/(public)/checkout/actions';
import { Button } from '@/components/ui/button';

export function PendingCheckoutActions({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  return <div className="mt-5">
    <form action={cancelCheckout} className="flex flex-wrap gap-3">
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="button" disabled={pending} onClick={() => {
        setError('');
        startTransition(async () => {
          try {
            const result = await resumeCheckout(orderId);
            if (result.url) window.location.assign(result.url);
            else setError(result.error || 'Payment is unavailable. Please try again.');
          } catch { setError('Unable to reopen payment. Check your connection and try again.'); }
        });
      }}>{pending ? <LoaderCircle className="animate-spin" /> : <CreditCard />}Continue to Payment</Button>
      <Button type="submit" variant="outline" disabled={pending}><X />Cancel Checkout</Button>
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-primary">{error}</p>}
  </div>;
}
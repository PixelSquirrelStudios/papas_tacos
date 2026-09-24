import { z } from 'zod';
import { getViewer } from '@/lib/auth/session';
import { getCustomerOrder } from '@/lib/account/data';
import { paymentDatabase } from '@/lib/payments/server';
import { createReceipt } from '@/lib/payments/receipt';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!await getViewer()) return new Response('Sign in to view your receipt.', { status: 401, headers });
  const { id } = await params;
  if (!z.guid().safeParse(id).success) return new Response('Receipt not found.', { status: 404, headers });
  try {
    const order = await getCustomerOrder(id);
    if (!order) return new Response('Receipt not found.', { status: 404, headers });
    if (!['paid', 'partially_refunded', 'refunded'].includes(order.payment_status)) return new Response('Payment is not confirmed yet.', { status: 409, headers });
    const { data: payment, error } = await paymentDatabase().from('payments').select('paid_at,refunded_pence')
      .eq('order_id', id).in('status', ['succeeded', 'partially_refunded', 'refunded']).single();
    if (error || !payment?.paid_at) return new Response('Receipt is temporarily unavailable.', { status: 503, headers });
    const pdf = await createReceipt(order, { paidAt: payment.paid_at, refunded: payment.refunded_pence });
    const disposition = new URL(request.url).searchParams.get('download') === '1' ? 'attachment' : 'inline';
    return new Response(Buffer.from(pdf), { headers: { ...headers, 'Content-Type': 'application/pdf', 'Content-Disposition': `${disposition}; filename="papas-tacos-receipt-${order.order_number}.pdf"` } });
  } catch {
    return new Response('Receipt is temporarily unavailable.', { status: 503, headers });
  }
}
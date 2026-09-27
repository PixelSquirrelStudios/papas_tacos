import { getPickupChoices } from '@/lib/payments/pickup';

export async function GET() {
  const result = await getPickupChoices();
  return Response.json(result, { status: result.error ? 503 : 200, headers: { 'Cache-Control': 'private, no-store' } });
}
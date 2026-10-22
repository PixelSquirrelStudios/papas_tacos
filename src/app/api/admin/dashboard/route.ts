import { getViewer } from '@/lib/auth/session';
import { adminError, getDashboardData } from '@/lib/admin/data';

export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const viewer = await getViewer();
    if (!viewer) return Response.json({ error: 'Unable to verify your session. Retrying automatically; sign in again if this continues.' }, { status: 401, headers });
    if (viewer.profile?.role !== 'admin') return Response.json({ error: 'Unable to verify administrator access. Retry or sign in again.' }, { status: 403, headers });
    return Response.json(await getDashboardData(), { headers });
  } catch (error) {
    return Response.json({ error: adminError(error) }, { status: 503, headers });
  }
}

import { getCatalogue, getSettings } from '@/lib/catalogue/data';

export async function GET() {
  const [catalogue, settings] = await Promise.all([getCatalogue(), getSettings()]);
  return Response.json({ catalogue, settings }, { headers: { 'Cache-Control': 'no-store' } });
}
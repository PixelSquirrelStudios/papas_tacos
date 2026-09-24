import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MaintenancePage } from '@/components/catalogue/maintenance-page';
import { getMaintenanceMode, getSettings } from '@/lib/catalogue/data';
import { getViewer } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Site Maintenance',
  robots: { index: false, follow: false },
};

export default async function Maintenance() {
  const viewer = await getViewer();
  if (viewer?.profile?.role === 'admin') redirect('/');
  const [enabled, settings] = await Promise.all([getMaintenanceMode(), getSettings()]);
  if (enabled === false) redirect('/');
  return <MaintenancePage settings={settings} />;
}
import { requireAdmin } from '@/lib/auth/session';
import { getDashboardData, adminError } from '@/lib/admin/data';
import type { DashboardSnapshot } from '@/lib/admin/dashboard';
import { Dashboard } from '@/components/admin/dashboard';

export default async function AdminPage() {
  const viewer = await requireAdmin();
  let data: DashboardSnapshot | undefined;
  let error = '';
  try {
    data = await getDashboardData();
  } catch (failure) { error = adminError(failure); }
  return <Dashboard fullName={viewer.profile?.full_name} initialData={data} initialError={error} />;
}
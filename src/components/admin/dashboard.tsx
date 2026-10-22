'use client';

import { useState } from 'react';
import { dashboardSnapshotSchema, type DashboardSnapshot } from '@/lib/admin/dashboard';
import { AdminRefresh } from './order-controls';
import { DashboardOverview } from './dashboard-overview';

export function Dashboard({ fullName, initialData, initialError = '' }: { fullName?: string | null; initialData?: DashboardSnapshot; initialError?: string }) {
  const [source, setSource] = useState({ initialData, initialError });
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(initialError);
  if (source.initialData !== initialData || source.initialError !== initialError) {
    setSource({ initialData, initialError });
    if (initialData) setData(initialData);
    setError(initialError);
  }

  async function refresh() {
    try {
      const response = await fetch('/api/admin/dashboard', { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (!response.ok) {
        const failure: unknown = await response.json();
        throw new Error(typeof failure === 'object' && failure !== null && 'error' in failure && typeof failure.error === 'string' ? failure.error : 'Unable to refresh the dashboard.');
      }
      const snapshot = dashboardSnapshotSchema.parse(await response.json());
      setData(snapshot);
      setError('');
    } catch (failure) {
      setError(failure instanceof Error && !['TypeError', 'TimeoutError', 'AbortError', 'ZodError'].includes(failure.name) ? failure.message : 'Live updates are temporarily unavailable. Retrying automatically.');
    }
  }

  return <>
    <AdminRefresh onRefresh={refresh} />
    <DashboardOverview fullName={fullName} orders={data?.orders ?? []} menu={data?.menu ?? []} events={data?.events ?? []} settings={data?.settings} error={data ? '' : error} refreshError={data ? error : ''} />
  </>;
}

'use client';

import { useOptimistic, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterSelect } from '@/components/ui/filter-select';
import { orderFilterParams, orderStatuses } from '@/lib/admin/orders';
import { statusLabels } from '@/lib/account/orders';

export function OrderFilters({ initialSearch, initialStatuses, initialEvents, events }: { initialSearch: string; initialStatuses: string[]; initialEvents: string[]; events: { value: string; label: string }[] }) {
  const router = useRouter();
  const [filters, setFilters] = useOptimistic({ search: initialSearch, statuses: initialStatuses, events: initialEvents });
  const [pending, startTransition] = useTransition();
  function update(next: typeof filters) {
    startTransition(() => {
      setFilters(next);
      router.replace(`/admin/orders?${orderFilterParams(next.search, next.statuses, next.events)}`, { scroll: false });
    });
  }
  return <div className="relative z-30 mb-6 grid grid-cols-[minmax(0,85fr)_minmax(0,15fr)] gap-3 border-y py-4" aria-busy={pending}>
    <div className="relative min-w-0"><Search className="absolute left-3 top-3 size-5 text-muted-foreground" aria-hidden="true" /><Input value={filters.search} onChange={(event) => update({ ...filters, search: event.target.value })} placeholder="Customer Name or Order Number" aria-label="Search Orders" className="h-11 pl-10" /></div>
    <Button type="button" className="h-11 min-w-0 px-0" aria-label="Reset Filters" title="Reset Filters" disabled={!filters.search && !filters.statuses.length && !filters.events.length} onClick={() => update({ search: '', statuses: [], events: [] })}><RotateCcw /><span className="hidden xl:inline">Reset Filters</span></Button>
    <div className="col-span-2 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      <FilterSelect label="Order Status" placeholder="All Statuses" options={orderStatuses.map((value) => ({ value, label: statusLabels[value as keyof typeof statusLabels] }))} value={filters.statuses} onChange={(statuses) => update({ ...filters, statuses })} />
      <FilterSelect label="Event" placeholder="All Events" options={events} value={filters.events} onChange={(events) => update({ ...filters, events })} />
    </div>
  </div>;
}
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminLoading() {
  return <div role="status" aria-label="Loading admin records" className="space-y-6 p-8"><Skeleton className="h-9 w-56" /><Skeleton className="h-10 w-full" />{[0, 1, 2, 3, 4].map((row) => <Skeleton key={row} className="h-16 w-full" />)}</div>;
}
import { Skeleton } from '@/components/ui/skeleton';

export default function AccountLoading() {
  return <main id="main-content" aria-busy="true" aria-label="Loading your account" className="mx-auto max-w-[1440px] px-5 py-8 sm:px-10 lg:px-16">
    <div className="grid min-h-[65svh] gap-8 md:grid-cols-[190px_minmax(0,1fr)]">
      <div className="space-y-4"><Skeleton className="h-5 w-28" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
      <div className="space-y-6"><Skeleton className="h-9 w-44" /><Skeleton className="h-24 w-full" /><Skeleton className="h-32 w-full" /></div>
    </div>
  </main>;
}
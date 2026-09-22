'use client';

import { Button } from '@/components/ui/button';

export default function AdminError({ reset }: { reset: () => void }) {
  return <main className="p-8"><h1 className="text-2xl font-semibold">Unable to load this view</h1><p className="mt-3 text-muted-foreground">Your changes may not have completed. Refresh before trying again.</p><Button className="mt-6" onClick={reset}>Try Again</Button></main>;
}
'use client';

import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto flex min-h-[60svh] max-w-lg flex-col justify-center px-6 py-16"><h1 className="font-display text-4xl">A LITTLE HICCUP.</h1><p className="mt-5 text-muted-foreground">Something went wrong. Please try again.</p><Button onClick={reset} className="mt-8 w-fit"><RotateCw className="size-4" aria-hidden="true" />Try Again</Button></main>;
}
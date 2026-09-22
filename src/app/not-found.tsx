import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return <main className="mx-auto flex min-h-[70svh] max-w-lg flex-col justify-center px-6 py-16"><p className="mb-4 text-sm text-pink">404</p><h1 className="font-display text-5xl">WRONG TURN.</h1><p className="mt-5 text-muted-foreground">This page is unavailable.</p><Button asChild className="mt-8 w-fit"><Link href="/"><ArrowLeft className="size-4" aria-hidden="true" />Back to Papa&apos;s</Link></Button></main>;
}
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Flower2 } from 'lucide-react';
import { getViewer } from '@/lib/auth/session';
import { safeReturnPath, signedInPath } from '@/lib/auth/redirects';
import { supabaseConfig } from '@/lib/supabase/config';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: 'Sign In', robots: { index: false, follow: false } };

const errors: Record<string, string> = {
  invalid_link: 'That sign-in link has expired, was already used, or could not be verified. Please request a new one.',
  google_unavailable: 'Google sign-in is unavailable right now. Please try email or come back shortly.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; mode?: string; error?: string }> }) {
  const params = await searchParams;
  const returnTo = safeReturnPath(params.next);
  const viewer = await getViewer();
  if (viewer) redirect(signedInPath(returnTo, viewer.profile?.role));
  return <main id="main-content" className="auth-surface px-5 py-12 sm:py-16">
    <div className="mx-auto w-full max-w-[420px]">
      <div className="mb-9"><Flower2 className="mb-5 size-9 text-pink" strokeWidth={1.4} aria-hidden="true" /><p className="mb-3 text-xs font-bold uppercase text-turquoise">The Papa&apos;s familia</p><h1 className="font-display text-5xl leading-tight sm:text-6xl">HOLA, HUNGRY?</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Good to have you here.</p></div>
      {params.error && errors[params.error] && <p role="alert" className="mb-6 border-l-2 border-pink pl-4 text-sm leading-relaxed">{errors[params.error]}</p>}
      <LoginForm initialMode={params.mode === 'signup' ? 'signup' : 'login'} returnTo={returnTo} configured={Boolean(supabaseConfig())} />
    </div>
  </main>;
}
'use client';

import { useActionState, useState } from 'react';
import { ArrowRight, Globe2, Mail, MailCheck } from 'lucide-react';
import { requestMagicLink, signInWithGoogle } from '@/app/auth/actions';
import { initialAuthState } from '@/lib/auth/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SubmitButton } from './submit-button';

function EmailForm({ mode, returnTo, configured }: { mode: 'login' | 'signup'; returnTo: string; configured: boolean }) {
  const [state, action, pending] = useActionState(requestMagicLink, initialAuthState);
  const [retry, setRetry] = useState(false);
  if (state.status === 'success' && !retry) return <div className="space-y-4 border-t border-border py-6" role="status">
    <MailCheck className="size-9 text-turquoise" aria-hidden="true" />
    <h2 className="text-xl font-semibold">Check Your Inbox</h2>
    <p className="text-sm leading-relaxed text-muted-foreground">{state.message}</p>
    <Button variant="outline" onClick={() => setRetry(true)} className="h-11">Try Another Email<ArrowRight className="size-4" aria-hidden="true" /></Button>
  </div>;
  return <form action={(formData) => { setRetry(false); action(formData); }} className="space-y-5">
    <input type="hidden" name="mode" value={mode} /><input type="hidden" name="next" value={returnTo} />
    {mode === 'signup' && <div className="space-y-2"><Label htmlFor="fullName">Your Name</Label><Input id="fullName" name="fullName" autoComplete="name" placeholder="Your Name" maxLength={120} required disabled={pending} className="h-12" /></div>}
    <div className="space-y-2"><Label htmlFor="email">Email Address</Label><Input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" maxLength={254} required disabled={pending} className="h-12" aria-describedby={state.status === 'error' ? 'email-error' : undefined} /></div>
    {state.status === 'error' && <p id="email-error" role="alert" className="text-sm text-destructive">{state.message}</p>}
    <SubmitButton className="h-12 w-full" pendingText="Sending Your Link..." disabled={!configured}><Mail className="size-4" aria-hidden="true" />Email Me a Sign-In Link</SubmitButton>
  </form>;
}

export function LoginForm({ initialMode, returnTo, configured }: { initialMode: 'login' | 'signup'; returnTo: string; configured: boolean }) {
  const [mode, setMode] = useState(initialMode);
  return <div>
    {!configured && <p role="alert" className="mb-5 text-sm text-destructive">Sign-in is temporarily unavailable. Please try again later.</p>}
    <Tabs value={mode} onValueChange={(value) => setMode(value as 'login' | 'signup')}>
      <TabsList className="grid w-full grid-cols-2 gap-1 p-1 group-data-[orientation=horizontal]/tabs:h-12"><TabsTrigger value="login" className="h-full min-w-0">Sign In</TabsTrigger><TabsTrigger value="signup" className="h-full min-w-0">Create an Account</TabsTrigger></TabsList>
      {(['login', 'signup'] as const).map((formMode) => <TabsContent key={formMode} value={formMode} className="mt-6">
        <form action={signInWithGoogle}><input type="hidden" name="next" value={returnTo} /><SubmitButton variant="outline" className="h-12 w-full" pendingText="Connecting to Google..." disabled={!configured}><Globe2 className="size-4" aria-hidden="true" />Continue with Google</SubmitButton></form>
        <div className="my-6 flex items-center gap-4 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or with email<span className="h-px flex-1 bg-border" /></div>
        <EmailForm mode={formMode} returnTo={returnTo} configured={configured} />
      </TabsContent>)}
    </Tabs>
  </div>;
}
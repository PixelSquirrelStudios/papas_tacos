'use client';

import { useActionState } from 'react';
import { Save } from 'lucide-react';
import { updateProfile } from '@/app/(public)/account/actions';
import { initialAuthState } from '@/lib/auth/validation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitButton } from './submit-button';

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string | null }) {
  const [state, action, pending] = useActionState(updateProfile, initialAuthState);
  return <form action={action} className="max-w-lg space-y-6">
    <div className="space-y-2"><Label htmlFor="profile-name">Your Name</Label><Input id="profile-name" name="fullName" autoComplete="name" defaultValue={fullName} required maxLength={120} disabled={pending} className="h-12" /></div>
    <div className="space-y-2"><Label htmlFor="profile-phone">Phone Number <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="profile-phone" name="phone" type="tel" autoComplete="tel" defaultValue={phone || ''} maxLength={30} disabled={pending} className="h-12" /></div>
    {state.message && <p role={state.status === 'error' ? 'alert' : 'status'} className={state.status === 'error' ? 'text-sm text-destructive' : 'text-sm text-turquoise'}>{state.message}</p>}
    <SubmitButton pendingText="Saving..." className="h-11"><Save className="size-4" aria-hidden="true" />Save Details</SubmitButton>
  </form>;
}
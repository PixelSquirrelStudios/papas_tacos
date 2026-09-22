'use client';

import { useFormStatus } from 'react-dom';
import { LoaderCircle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SubmitButton({ children, pendingText = 'Please wait...', className, disabled, variant = 'default' }: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
}) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} className={className} disabled={disabled || pending} aria-disabled={disabled || pending}>
    {pending ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{pendingText}</> : children}
  </Button>;
}

export function SignOutButton() {
  return <SubmitButton pendingText="Signing Out..." className="w-full justify-start"><LogOut className="size-4" aria-hidden="true" />Sign Out</SubmitButton>;
}
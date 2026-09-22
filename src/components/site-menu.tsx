'use client';

import Link from 'next/link';
import { ArrowUpRight, Menu } from 'lucide-react';
import { signOut } from '@/app/auth/actions';
import { SignOutButton } from '@/components/auth/submit-button';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

export function SiteMenu({ signedIn, admin }: { signedIn: boolean; admin: boolean }) {
  const links = [
    { href: '/', label: 'Home' },
    { href: '/menu', label: 'The Menu' },
    { href: '/events', label: 'Find the Truck' },
    { href: '/testimonials', label: 'Testimonials' },
    { href: '/bag', label: 'Your Bag' },
    { href: '/#our-spirit', label: 'Our Spirit' },
    { href: signedIn ? '/account' : '/login', label: signedIn ? 'Your Account' : 'Sign In' },
    ...(!signedIn ? [{ href: '/login?mode=signup', label: 'Create an Account' }] : []),
    ...(admin ? [{ href: '/admin', label: 'Admin Dashboard' }] : []),
  ];
  return <Sheet>
    <SheetTrigger asChild><Button variant="ghost" size="icon" className="size-9 bg-accent hover:bg-input dark:hover:bg-input sm:size-11" aria-label="Open navigation" title="Open Navigation"><Menu className="size-5" /></Button></SheetTrigger>
    <SheetContent className="w-[min(90vw,400px)] overflow-y-auto bg-background">
      <SheetHeader className="px-7 pt-12">
        <SheetTitle className="font-display text-4xl text-primary">HOLA, AMIGO.</SheetTitle>
        <SheetDescription>Papa&apos;s Tacos</SheetDescription>
      </SheetHeader>
      <nav aria-label="Main navigation" className="px-7">
        {links.map((link) => <SheetClose key={link.href} asChild><Link href={link.href} className="flex min-h-16 items-center justify-between gap-4 border-b border-border py-4 text-lg hover:text-primary">{link.label}<ArrowUpRight className="size-5 shrink-0" aria-hidden="true" /></Link></SheetClose>)}
      </nav>
      {signedIn && <form action={signOut} className="px-7 py-4"><SignOutButton /></form>}
      <p className="mt-auto px-7 pb-8 text-sm text-muted-foreground">Mexican soul. Street food spirit.</p>
    </SheetContent>
  </Sheet>;
}